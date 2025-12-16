/**
 * Auto-Fix Hook
 *
 * Manages automatic error fixing functionality for the preview panel.
 * Handles error classification, simple pattern-based fixes, and AI-powered fixes.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { getProviderManager } from '../services/ai';
import { FileSystem, LogEntry } from '../types';
import { cleanGeneratedCode, isValidCode } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { attemptAutoFix, classifyError, canAutoFix, wasRecentlyFixed } from '../services/autoFixService';
import { parseStackTrace, buildAutoFixPrompt } from '../utils/errorContext';

interface UseAutoFixOptions {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  appCode: string | undefined;
  selectedModel: string;
  isGenerating: boolean;
  logs: LogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  onSendErrorToChat?: (errorMessage: string) => void;
  generateSystemInstruction: () => string;
}

interface UseAutoFixReturn {
  // State
  autoFixEnabled: boolean;
  setAutoFixEnabled: (enabled: boolean) => void;
  isAutoFixing: boolean;
  autoFixToast: string | null;
  pendingAutoFix: string | null;
  failedAutoFixError: string | null;
  currentError: string | null;
  currentErrorStack: string | undefined;
  errorTargetFile: string;
  setCurrentError: (error: string | null) => void;
  setCurrentErrorStack: (stack: string | undefined) => void;
  setErrorTargetFile: (file: string) => void;

  // Handlers
  handleConfirmAutoFix: () => void;
  handleDeclineAutoFix: () => void;
  handleSendErrorToChat: () => void;
  handleDismissFailedError: () => void;

  // Error processing
  processError: (errorMsg: string, stack?: string) => void;

  // Helpers (for ErrorFixPanel)
  parseStackTrace: (errorMessage: string) => { file?: string; line?: number; column?: number };
}

/**
 * Hook for managing auto-fix functionality
 */
export function useAutoFix({
  files,
  setFiles,
  appCode,
  selectedModel,
  isGenerating,
  logs,
  setLogs,
  onSendErrorToChat,
  generateSystemInstruction,
}: UseAutoFixOptions): UseAutoFixReturn {
  // State
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixToast, setAutoFixToast] = useState<string | null>(null);
  const [pendingAutoFix, setPendingAutoFix] = useState<string | null>(null);
  const [failedAutoFixError, setFailedAutoFixError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [currentErrorStack, setCurrentErrorStack] = useState<string | undefined>(undefined);
  const [errorTargetFile, setErrorTargetFile] = useState<string>('src/App.tsx');

  // Refs
  const autoFixTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFixedErrorRef = useRef<string | null>(null);
  const filesRef = useRef<FileSystem>(files);

  // Keep filesRef updated
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Main auto-fix function
  const autoFixError = useCallback(async (errorMessage: string) => {
    console.log('[AutoFix] autoFixError called:', errorMessage.slice(0, 100));

    if (!appCode || isAutoFixing || isGenerating) {
      return;
    }

    // Skip if we just fixed this error
    if (lastFixedErrorRef.current === errorMessage) {
      return;
    }

    setPendingAutoFix(null);
    setIsAutoFixing(true);
    setAutoFixToast('🔍 Analyzing error...');
    lastFixedErrorRef.current = errorMessage;

    const requestId = debugLog.request('auto-fix', {
      model: selectedModel,
      prompt: `Fix runtime error: ${errorMessage}`,
      metadata: { errorMessage }
    });
    const startTime = Date.now();

    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();

      if (!activeConfig) {
        throw new Error('No AI provider configured');
      }

      const modelToUse = activeConfig.defaultModel;
      setAutoFixToast('📦 Building context...');

      // Determine target file
      const stackInfo = parseStackTrace(errorMessage);
      const targetFile = stackInfo.file || 'src/App.tsx';
      const targetFileContent = files[targetFile] || appCode || '';

      if (!targetFileContent) {
        throw new Error(`Target file not found: ${targetFile}`);
      }

      // Build prompt using utility
      const systemPrompt = buildAutoFixPrompt({
        errorMessage,
        targetFile,
        targetFileContent,
        files,
        techStackContext: generateSystemInstruction(),
        logs,
      });

      const shortModelName = modelToUse.split('/').pop()?.replace('models-', '') || modelToUse;
      setAutoFixToast(`🤖 Fixing ${targetFile.split('/').pop()} (${shortModelName})...`);

      const response = await manager.generate({
        prompt: systemPrompt,
        responseFormat: 'text'
      }, modelToUse);

      setAutoFixToast('⚙️ Processing fix...');

      const fixedCode = cleanGeneratedCode(response.text || '');
      const errorClassification = classifyError(errorMessage);

      debugLog.response('auto-fix', {
        id: requestId,
        model: modelToUse,
        duration: Date.now() - startTime,
        response: fixedCode.slice(0, 500) + '...',
        metadata: {
          success: !!(fixedCode && isValidCode(fixedCode)),
          category: errorClassification.category,
        }
      });

      if (fixedCode && isValidCode(fixedCode)) {
        setFiles({ ...files, [targetFile]: fixedCode });
        setAutoFixToast(`✅ Fixed ${targetFile.split('/').pop()}!`);
        setFailedAutoFixError(null);

        // Clear the error from logs
        setLogs(prev => prev.map(l =>
          l.message === errorMessage ? { ...l, isFixed: true } : l
        ));

        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), 3000);
      } else {
        console.warn('[AutoFix] Fix failed - invalid code generated');
        setFailedAutoFixError(errorMessage);
        setAutoFixToast(null);
      }
    } catch (e) {
      console.error('[AutoFix] Exception:', e);
      setFailedAutoFixError(errorMessage);
      setAutoFixToast(null);
      debugLog.error('auto-fix', e instanceof Error ? e.message : 'Auto-fix failed', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime
      });
    } finally {
      setIsAutoFixing(false);
    }
  }, [appCode, files, setFiles, setLogs, logs, isAutoFixing, isGenerating, selectedModel, generateSystemInstruction]);

  // Confirmation handlers
  const handleConfirmAutoFix = useCallback(() => {
    console.log('[AutoFix] Fix with AI button clicked, pendingAutoFix:', pendingAutoFix?.slice(0, 100));
    if (pendingAutoFix) {
      autoFixError(pendingAutoFix);
    }
  }, [pendingAutoFix, autoFixError]);

  const handleDeclineAutoFix = useCallback(() => {
    setPendingAutoFix(null);
  }, []);

  const handleSendErrorToChat = useCallback(() => {
    if (failedAutoFixError && onSendErrorToChat) {
      onSendErrorToChat(failedAutoFixError);
      setFailedAutoFixError(null);
    }
  }, [failedAutoFixError, onSendErrorToChat]);

  const handleDismissFailedError = useCallback(() => {
    setFailedAutoFixError(null);
  }, []);

  // Process error from message listener
  const processError = useCallback((errorMsg: string, stack?: string) => {
    // Update Error Fix Panel state
    setCurrentError(errorMsg);
    setCurrentErrorStack(stack);

    // Parse stack trace to determine target file
    const stackInfo = parseStackTrace(errorMsg);
    if (stackInfo.file) {
      setErrorTargetFile(stackInfo.file);
    }

    console.log('[AutoFix] Error detected:', errorMsg.slice(0, 150));
    console.log('[AutoFix] State check - autoFixEnabled:', autoFixEnabled, 'isAutoFixing:', isAutoFixing, 'pendingAutoFix:', !!pendingAutoFix);

    if (!autoFixEnabled || isAutoFixing || pendingAutoFix) {
      return;
    }

    // Use robust error classification
    const errorInfo = classifyError(errorMsg);
    console.log('[AutoFix] Error classification:', errorInfo);

    // Skip ignorable/transient errors
    if (errorInfo.isIgnorable) {
      console.log('[AutoFix] Ignoring transient error:', errorMsg.slice(0, 100));
      return;
    }

    // Skip if already fixed
    if (lastFixedErrorRef.current === errorMsg || wasRecentlyFixed(errorMsg)) {
      return;
    }

    // Try simple auto-fix
    if (appCode && canAutoFix(errorMsg)) {
      try {
        const errorLower = errorMsg.toLowerCase();
        const isBareSpecifierError = errorLower.includes('bare specifier') || errorLower.includes('was not remapped');

        let targetFile = 'src/App.tsx';
        let targetFileContent = appCode;

        if (isBareSpecifierError) {
          const specifierMatch = errorMsg.match(/["']?(src\/[\w./-]+)["']?\s*was a bare specifier/i);
          if (specifierMatch) {
            const bareSpecifier = specifierMatch[1];
            const bareWithoutExt = bareSpecifier.replace(/\.(tsx?|jsx?)$/, '');

            console.log('[AutoFix] Bare specifier error, searching for import of:', bareSpecifier);

            for (const [filePath, content] of Object.entries(filesRef.current)) {
              if (content.includes(bareSpecifier) || content.includes(bareWithoutExt)) {
                console.log('[AutoFix] Found import in:', filePath);
                targetFile = filePath;
                targetFileContent = content;
                break;
              }
            }
          }
        } else {
          const stackInfo = parseStackTrace(errorMsg);
          targetFile = stackInfo.file || 'src/App.tsx';
          targetFileContent = filesRef.current[targetFile] || appCode;
        }

        console.log('[AutoFix] Simple fix attempt for:', targetFile);
        console.log('[AutoFix] Target file exists:', !!filesRef.current[targetFile], 'Content length:', targetFileContent?.length);

        const fixResult = attemptAutoFix(errorMsg, targetFileContent);
        console.log('[AutoFix] Fix result:', { success: fixResult.success, wasAINeeded: fixResult.wasAINeeded, error: fixResult.error, fixType: fixResult.fixType });

        if (fixResult.success && !fixResult.wasAINeeded) {
          lastFixedErrorRef.current = errorMsg;
          setFiles({ ...filesRef.current, [targetFile]: fixResult.newCode });
          setAutoFixToast(`⚡ ${fixResult.description}`);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), 3000);
          console.log('[AutoFix] Applied:', fixResult.description, `(${fixResult.fixType})`, 'to:', targetFile);
          return;
        }

        if (fixResult.error) {
          console.log('[AutoFix] Could not fix:', fixResult.error);
        }
      } catch (e) {
        console.error('[AutoFix] Service error:', e);
      }
    }

    // Show AI fix confirmation after delay
    console.log('[AutoFix] Checking if AI dialog should show:', { isFixable: errorInfo.isFixable, priority: errorInfo.priority });
    if (errorInfo.isFixable || errorInfo.priority >= 3) {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      autoFixTimeoutRef.current = setTimeout(() => {
        console.log('[AutoFix] Showing AI fix dialog for:', errorMsg.slice(0, 100));
        setPendingAutoFix(errorMsg);
      }, 500);
    } else {
      console.log('[AutoFix] Not showing AI dialog - error not fixable or low priority');
    }
  }, [autoFixEnabled, isAutoFixing, pendingAutoFix, appCode, setFiles]);

  return {
    // State
    autoFixEnabled,
    setAutoFixEnabled,
    isAutoFixing,
    autoFixToast,
    pendingAutoFix,
    failedAutoFixError,
    currentError,
    currentErrorStack,
    errorTargetFile,
    setCurrentError,
    setCurrentErrorStack,
    setErrorTargetFile,

    // Handlers
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    handleSendErrorToChat,
    handleDismissFailedError,

    // Error processing
    processError,

    // Helpers
    parseStackTrace,
  };
}
