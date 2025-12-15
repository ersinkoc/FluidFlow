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

  // Helper: Extract local imports from code
  const extractLocalImports = useCallback((code: string): string[] => {
    const imports: string[] = [];
    const importRegex = /import\s+(?:(?:\{[^}]*\}|[^{}\s,]+|\*\s+as\s+\w+)(?:\s*,\s*)?)+\s+from\s+['"]\.\.?\/([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      const possiblePaths = [
        `src/${importPath}.tsx`,
        `src/${importPath}.ts`,
        `src/${importPath}/index.tsx`,
        `src/${importPath}/index.ts`,
        `${importPath}.tsx`,
        `${importPath}.ts`,
      ];
      for (const p of possiblePaths) {
        if (files[p]) {
          imports.push(p);
          break;
        }
      }
    }
    return [...new Set(imports)];
  }, [files]);

  // Helper: Parse stack trace to identify error location
  const parseStackTrace = useCallback((errorMessage: string): { file?: string; line?: number; column?: number } => {
    console.log('[AutoFix] Parsing error message:', errorMessage.slice(0, 200));

    // Pattern: Transpilation failed for src/components/Features.tsx
    const transpileMatch = errorMessage.match(/(?:Transpilation failed for|failed for)\s+(src\/[\w./]+\.tsx?)[\s:]/i);
    if (transpileMatch) {
      const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
      const result = {
        file: transpileMatch[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        column: lineMatch ? parseInt(lineMatch[2], 10) : undefined
      };
      console.log('[AutoFix] Found transpile error, target file:', result);
      return result;
    }

    // Pattern: at Component (filename.tsx:123:45)
    const stackMatch = errorMessage.match(/at\s+(?:\w+\s+\()?([\w./]+\.tsx?):(\d+):(\d+)/);
    if (stackMatch) {
      const result = {
        file: stackMatch[1],
        line: parseInt(stackMatch[2], 10),
        column: parseInt(stackMatch[3], 10)
      };
      console.log('[AutoFix] Found stack trace, target file:', result);
      return result;
    }

    // Pattern: Error in src/App.tsx:123
    const simpleMatch = errorMessage.match(/(?:Error in|at)\s+(src\/[\w./]+\.tsx?):?(\d+)?/i);
    if (simpleMatch) {
      const result = {
        file: simpleMatch[1],
        line: simpleMatch[2] ? parseInt(simpleMatch[2], 10) : undefined
      };
      console.log('[AutoFix] Found simple error pattern, target file:', result);
      return result;
    }

    // Pattern: /src/components/File.tsx: Unexpected token
    const pathMatch = errorMessage.match(/\/(src\/[\w./]+\.tsx?):/);
    if (pathMatch) {
      const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
      const result = {
        file: pathMatch[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        column: lineMatch ? parseInt(lineMatch[2], 10) : undefined
      };
      console.log('[AutoFix] Found path match, target file:', result);
      return result;
    }

    console.log('[AutoFix] No file pattern matched, will use default src/App.tsx');
    return {};
  }, []);

  // Helper: Get relevant files based on error context
  const getRelatedFiles = useCallback((errorMessage: string, mainCode: string): Record<string, string> => {
    const related: Record<string, string> = {};

    // Get local imports from App.tsx
    const localImports = extractLocalImports(mainCode);
    for (const importPath of localImports.slice(0, 5)) {
      if (files[importPath]) {
        related[importPath] = files[importPath];
      }
    }

    // Check for component name in error
    const componentMatch = errorMessage.match(/(?:Element type|'|")(\w+)(?:'|")|(?:cannot read|undefined)\s+(?:property\s+)?['"]?(\w+)['"]?/i);
    if (componentMatch) {
      const componentName = componentMatch[1] || componentMatch[2];
      for (const [path, content] of Object.entries(files)) {
        if (path.toLowerCase().includes(componentName.toLowerCase()) ||
            content.includes(`export const ${componentName}`) ||
            content.includes(`export function ${componentName}`) ||
            content.includes(`export default ${componentName}`)) {
          if (!related[path] && Object.keys(related).length < 6) {
            related[path] = content;
          }
        }
      }
    }

    // Include types file if exists
    if (files['src/types.ts'] && !related['src/types.ts']) {
      related['src/types.ts'] = files['src/types.ts'];
    }

    // Parse stack trace for specific file
    const stackInfo = parseStackTrace(errorMessage);
    if (stackInfo.file && files[stackInfo.file] && !related[stackInfo.file]) {
      related[stackInfo.file] = files[stackInfo.file];
    }

    return related;
  }, [files, extractLocalImports, parseStackTrace]);

  // Helper: Get recent console logs for context
  const getRecentLogsContext = useCallback((): string => {
    const recentLogs = logs.slice(-10);
    if (recentLogs.length === 0) return '';

    const logContext = recentLogs
      .filter(l => l.type === 'error' || l.type === 'warn')
      .map(l => `[${l.type.toUpperCase()}] ${l.message}`)
      .join('\n');

    return logContext ? `## Recent Console Logs\n\`\`\`\n${logContext}\n\`\`\`\n` : '';
  }, [logs]);

  // Main auto-fix function
  const autoFixError = useCallback(async (errorMessage: string) => {
    console.log('[AutoFix] autoFixError called:', errorMessage.slice(0, 100));
    console.log('[AutoFix] State:', { hasAppCode: !!appCode, isAutoFixing, isGenerating, lastFixedError: lastFixedErrorRef.current?.slice(0, 50) });

    if (!appCode || isAutoFixing || isGenerating) {
      console.log('[AutoFix] Early return - appCode:', !!appCode, 'isAutoFixing:', isAutoFixing, 'isGenerating:', isGenerating);
      return;
    }

    // Skip if we just fixed this error
    if (lastFixedErrorRef.current === errorMessage) {
      console.log('[AutoFix] Early return - already fixed this error');
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
      console.log('[AutoFix] Using provider:', activeConfig.type, 'model:', modelToUse);

      // Build comprehensive context
      setAutoFixToast('📦 Building context...');
      const techStackContext = generateSystemInstruction();
      const errorClassification = classifyError(errorMessage);
      const relatedFiles = getRelatedFiles(errorMessage, appCode);
      const recentLogsContext = getRecentLogsContext();
      const stackInfo = parseStackTrace(errorMessage);

      const targetFile = stackInfo.file || 'src/App.tsx';
      const targetFileContent = files[targetFile] || appCode || '';

      console.log('[AutoFix] Error classification:', errorClassification);
      console.log('[AutoFix] Target file:', targetFile);
      console.log('[AutoFix] Related files:', Object.keys(relatedFiles));

      if (!targetFileContent) {
        throw new Error(`Target file not found: ${targetFile}`);
      }

      // Build related files section
      let relatedFilesSection = '';
      const relatedEntries = Object.entries(relatedFiles).filter(([path]) => path !== targetFile);
      if (relatedEntries.length > 0) {
        relatedFilesSection = '\n## Related Files (may contain relevant code)\n';
        for (const [path, content] of relatedEntries) {
          const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n// ... truncated' : content;
          relatedFilesSection += `### ${path}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
        }
      }

      // Error-specific hints
      const categoryHints: Record<string, string> = {
        'import': `- Check if the import source exists and is correct
- For motion animations, use 'motion/react' (not 'framer-motion')
- For React Router v7, imports are from 'react-router' (not 'react-router-dom')
- Verify named vs default exports match`,
        'syntax': `- Check for missing brackets, parentheses, or semicolons
- Verify JSX syntax is valid
- Ensure template literals are properly closed`,
        'type': `- Check type definitions in types.ts if available
- Ensure props match expected types
- Verify generic type parameters`,
        'runtime': `- Check for null/undefined access
- Verify async operations are properly awaited
- Ensure state is initialized before use`,
        'react': `- Verify hook rules (only call in component body)
- Check key props for list items
- Ensure proper event handler binding`
      };

      const categoryHint = categoryHints[errorClassification.category] || '';

      const systemPrompt = `You are an expert React/TypeScript developer. Fix the following runtime error.

${techStackContext}

## Error Information
- **Error Message**: ${errorMessage}
- **Error Category**: ${errorClassification.category}
- **Priority**: ${errorClassification.priority}/5
- **Target File**: ${targetFile}${stackInfo.line ? ` (line ${stackInfo.line})` : ''}

${recentLogsContext}

## Available Files in Project
${Object.keys(files).join(', ')}

${relatedFilesSection}

## File to Fix (${targetFile})
\`\`\`tsx
${targetFileContent}
\`\`\`

## Fix Guidelines
1. ONLY fix the specific error - do not refactor unrelated code
2. Maintain the existing code style and patterns
3. Ensure all imports are correct (check the tech stack above for correct package names)
4. If a component is undefined, check if it should be imported or defined
5. For missing exports, check related files above for correct export names
6. Pay attention to special characters in strings (like apostrophes)

${categoryHint ? `## Category-Specific Hints\n${categoryHint}` : ''}

## Required Output Format
Return ONLY the complete fixed ${targetFile} code.
- No explanations or comments about the fix
- No markdown code blocks or backticks
- Just valid TypeScript/TSX code that can directly replace the file`;

      console.log('[AutoFix] Sending prompt to AI:', {
        model: modelToUse,
        targetFile,
        errorCategory: errorClassification.category,
        relatedFilesCount: relatedEntries.length,
        promptLength: systemPrompt.length
      });

      const shortModelName = modelToUse.split('/').pop()?.replace('models-', '') || modelToUse;
      setAutoFixToast(`🤖 Fixing ${targetFile.split('/').pop()} (${shortModelName})...`);

      const response = await manager.generate({
        prompt: systemPrompt,
        responseFormat: 'text'
      }, modelToUse);

      setAutoFixToast('⚙️ Processing fix...');

      const fixedCode = cleanGeneratedCode(response.text || '');

      console.log('[AutoFix] Response received:', {
        responseLength: response.text?.length || 0,
        fixedCodeLength: fixedCode.length,
        isValid: !!(fixedCode && isValidCode(fixedCode))
      });

      debugLog.response('auto-fix', {
        id: requestId,
        model: modelToUse,
        duration: Date.now() - startTime,
        response: fixedCode.slice(0, 500) + '...',
        metadata: {
          success: !!(fixedCode && isValidCode(fixedCode)),
          category: errorClassification.category,
          relatedFilesCount: Object.keys(relatedFiles).length
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
  }, [appCode, files, setFiles, setLogs, isAutoFixing, isGenerating, selectedModel, generateSystemInstruction, getRelatedFiles, getRecentLogsContext, parseStackTrace]);

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
  }, [autoFixEnabled, isAutoFixing, pendingAutoFix, appCode, setFiles, parseStackTrace]);

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
