/**
 * Auto-Fix Hook
 *
 * Manages automatic error fixing functionality for the preview panel.
 * Uses the FixEngine for multi-strategy error resolution.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { FileSystem, LogEntry } from '../types';
import { debugLog } from './useDebugStore';
import {
  FixEngine,
  FixStrategy,
  errorAnalyzer,
  tryLocalFix,
  tryFixBareSpecifierMultiFile,
  verifyFix,
  fixState,
  fixAnalytics,
} from '../services/errorFix';
import { parseStackTrace } from '../utils/errorContext';

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
  currentFixStrategy: FixStrategy | null;
  setCurrentError: (error: string | null) => void;
  setCurrentErrorStack: (stack: string | undefined) => void;
  setErrorTargetFile: (file: string) => void;

  // Handlers
  handleConfirmAutoFix: () => void;
  handleDeclineAutoFix: () => void;
  handleSendErrorToChat: () => void;
  handleDismissFailedError: () => void;
  abortFix: () => void;

  // Error processing
  processError: (errorMsg: string, stack?: string) => void;

  // Helpers
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
  const [currentFixStrategy, setCurrentFixStrategy] = useState<FixStrategy | null>(null);

  // Refs
  const autoFixTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFixedErrorRef = useRef<string | null>(null);
  const filesRef = useRef<FileSystem>(files);
  const engineRef = useRef<FixEngine | null>(null);

  // Keep filesRef updated
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Show toast with auto-hide
  const showToast = useCallback((message: string, duration = 3000) => {
    setAutoFixToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), duration);
  }, []);

  // Main auto-fix function using FixEngine
  const autoFixError = useCallback(async (errorMessage: string) => {
    if (!appCode || isAutoFixing || isGenerating) return;
    if (lastFixedErrorRef.current === errorMessage) return;

    setPendingAutoFix(null);
    setIsAutoFixing(true);
    setAutoFixToast('Analyzing error...');
    lastFixedErrorRef.current = errorMessage;

    const requestId = debugLog.request('auto-fix', {
      model: selectedModel,
      prompt: `Fix runtime error: ${errorMessage}`,
      metadata: { errorMessage }
    });
    const startTime = Date.now();

    try {
      const stackInfo = parseStackTrace(errorMessage);
      const targetFile = stackInfo.file || 'src/App.tsx';

      const engine = new FixEngine({
        files: filesRef.current,
        errorMessage,
        errorStack: currentErrorStack,
        targetFile,
        appCode,
        logs,
        systemInstruction: generateSystemInstruction(),
        onProgress: (stage, progress) => setAutoFixToast(`${stage} (${progress}%)`),
        onStrategyChange: (strategy) => {
          setCurrentFixStrategy(strategy);
          console.log('[AutoFix] Strategy:', strategy);
        },
        maxAttempts: 10,
        timeout: 90000,
      });

      engineRef.current = engine;
      const result = await engine.fix();

      debugLog.response('auto-fix', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime,
        response: `Strategy: ${result.strategy}, Attempts: ${result.attempts}`,
        metadata: { success: result.success, strategy: result.strategy, attempts: result.attempts }
      });

      if (result.success && Object.keys(result.fixedFiles).length > 0) {
        const changedFiles = Object.keys(result.fixedFiles);
        const verification = verifyFix({
          originalError: errorMessage,
          originalFiles: filesRef.current,
          fixedFiles: { ...filesRef.current, ...result.fixedFiles },
          changedFiles,
          strictMode: false,
        });

        if (verification.isValid || verification.confidence !== 'low') {
          setFiles({ ...filesRef.current, ...result.fixedFiles });
          const fileNames = changedFiles.map(f => f.split('/').pop()).join(', ');
          showToast(`Fixed ${fileNames}!`);
          setFailedAutoFixError(null);
          setLogs(prev => prev.map(l =>
            l.message === errorMessage ? { ...l, isFixed: true } : l
          ));
          console.log('[AutoFix] Applied:', result.strategy, changedFiles);
        } else {
          console.warn('[AutoFix] Verification failed:', verification.issues);
          setFailedAutoFixError(errorMessage);
          setAutoFixToast(null);
        }
      } else {
        console.warn('[AutoFix] All strategies exhausted:', result.error);
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
      setCurrentFixStrategy(null);
      engineRef.current = null;
    }
  }, [appCode, isAutoFixing, isGenerating, selectedModel, generateSystemInstruction, logs, currentErrorStack, setFiles, setLogs, showToast]);

  // Handlers
  const handleConfirmAutoFix = useCallback(() => {
    if (pendingAutoFix) autoFixError(pendingAutoFix);
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

  const abortFix = useCallback(() => {
    engineRef.current?.abort();
    setIsAutoFixing(false);
    setAutoFixToast(null);
    setCurrentFixStrategy(null);
  }, []);

  // Process error from preview
  const processError = useCallback((errorMsg: string, stack?: string) => {
    setCurrentError(errorMsg);
    setCurrentErrorStack(stack);

    const stackInfo = parseStackTrace(errorMsg);
    if (stackInfo.file) setErrorTargetFile(stackInfo.file);

    if (!autoFixEnabled || isAutoFixing || pendingAutoFix) return;

    // Analyze error
    const parsed = errorAnalyzer.analyze(errorMsg, stack, filesRef.current);

    if (parsed.isIgnorable) {
      console.log('[AutoFix] Ignoring:', errorMsg.slice(0, 100));
      return;
    }

    // Check if already fixed
    if (lastFixedErrorRef.current === errorMsg || fixState.wasRecentlyFixed(errorMsg)) {
      return;
    }

    // Try local fix first
    if (appCode && parsed.isAutoFixable) {
      const startTime = Date.now();

      // Try multi-file fix for bare specifiers
      if (parsed.type === 'bare-specifier') {
        const multiResult = tryFixBareSpecifierMultiFile(errorMsg, filesRef.current);
        if (multiResult.success && Object.keys(multiResult.fixedFiles).length > 0) {
          lastFixedErrorRef.current = errorMsg;
          setFiles({ ...filesRef.current, ...multiResult.fixedFiles });
          showToast(multiResult.description);
          fixAnalytics.record(errorMsg, parsed.category, 'bare-specifier', true, Date.now() - startTime);
          return;
        }
      }

      // Try single-file fix
      const targetFile = stackInfo.file || 'src/App.tsx';
      const targetContent = filesRef.current[targetFile] || appCode;
      const localResult = tryLocalFix(errorMsg, targetContent, filesRef.current);

      if (localResult.success && localResult.fixedFiles['current']) {
        lastFixedErrorRef.current = errorMsg;
        setFiles({ ...filesRef.current, [targetFile]: localResult.fixedFiles['current'] });
        showToast(localResult.description);
        fixAnalytics.record(errorMsg, parsed.category, localResult.fixType, true, Date.now() - startTime);
        return;
      }
    }

    // Show AI fix prompt for fixable errors
    if (parsed.priority >= 3) {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      autoFixTimeoutRef.current = setTimeout(() => {
        setPendingAutoFix(errorMsg);
      }, 500);
    }
  }, [autoFixEnabled, isAutoFixing, pendingAutoFix, appCode, setFiles, showToast]);

  return {
    autoFixEnabled,
    setAutoFixEnabled,
    isAutoFixing,
    autoFixToast,
    pendingAutoFix,
    failedAutoFixError,
    currentError,
    currentErrorStack,
    errorTargetFile,
    currentFixStrategy,
    setCurrentError,
    setCurrentErrorStack,
    setErrorTargetFile,
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    handleSendErrorToChat,
    handleDismissFailedError,
    abortFix,
    processError,
    parseStackTrace,
  };
}
