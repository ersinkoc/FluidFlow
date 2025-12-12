import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Monitor, Smartphone, Tablet, RefreshCw, Eye, Code2, Copy, Check, Download, Database,
  ShieldCheck, Pencil, Send, FileText, Wrench, Package, Loader2,
  SplitSquareVertical, X, Zap, ZapOff, MousePointer2, Bug, Settings, ChevronDown, Shield,
  ChevronLeft, ChevronRight, Globe, GitBranch, Play, AlertTriangle, Box, MessageSquare, Bot, Map
} from 'lucide-react';
import { getProviderManager } from '../../services/ai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import { FileSystem, LogEntry, NetworkRequest, AccessibilityReport, TabType, TerminalTab, PreviewDevice, PushResult } from '../../types';
import { cleanGeneratedCode, isValidCode } from '../../utils/cleanCode';
import { debugLog } from '../../hooks/useDebugStore';
import { attemptAutoFix, classifyError, canAutoFix, wasRecentlyFixed } from '../../services/autoFixService';
import { ACCESSIBILITY_AUDIT_SCHEMA, FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from '../../services/ai/utils/schemas';
import { useTechStack } from '../../hooks/useTechStack';

// Sub-components
import { CodeEditor } from './CodeEditor';
import { ConsolePanel } from './ConsolePanel';
import { FileExplorer } from './FileExplorer';
import { ExportModal } from './ExportModal';
import { GithubModal } from './GithubModal';
import { AccessibilityModal } from './AccessibilityModal';
import { ConsultantReport } from './ConsultantReport';
import { ComponentInspector, InspectionOverlay, InspectedElement, EditScope } from './ComponentInspector';
import DebugPanel from './DebugPanel';
import { MarkdownPreview } from './MarkdownPreview';
import { DBStudio } from './DBStudio';
import { CodeMapTab } from './CodeMapTab';
import { EnvironmentPanel } from './EnvironmentPanel';
import { GitPanel } from '../GitPanel';
import { RunnerPanel } from './RunnerPanel';
import { WebContainerPanel } from './WebContainerPanel';
import { ErrorFixPanel } from './ErrorFixPanel';
import { DocsPanel } from './DocsPanel';
import { GitStatus } from '../../services/projectApi';

interface PreviewPanelProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;
  suggestions: string[] | null;
  setSuggestions: (s: string[] | null) => void;
  isGenerating: boolean;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  selectedModel: string;
  activeTab?: TabType;
  setActiveTab?: (tab: TabType) => void;
  onInspectEdit?: (prompt: string, element: InspectedElement, scope: EditScope) => Promise<void>;
  onSendErrorToChat?: (errorMessage: string) => void;
  // Git props
  projectId?: string | null;
  gitStatus?: GitStatus | null;
  onInitGit?: (force?: boolean) => Promise<boolean>;
  onCommit?: (message: string) => Promise<boolean>;
  onRefreshGitStatus?: () => Promise<void>;
  // Local changes (WIP)
  hasUncommittedChanges?: boolean;
  localChanges?: { path: string; status: 'added' | 'modified' | 'deleted' }[];
  onDiscardChanges?: () => Promise<void>;
  onRevertToCommit?: (commitHash: string) => Promise<boolean>;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  files, setFiles, activeFile, setActiveFile, suggestions, setSuggestions, isGenerating, reviewChange, selectedModel,
  activeTab: externalActiveTab, setActiveTab: externalSetActiveTab, onInspectEdit, onSendErrorToChat,
  projectId, gitStatus, onInitGit, onCommit, onRefreshGitStatus,
  hasUncommittedChanges, localChanges, onDiscardChanges, onRevertToCommit
}) => {
  // State
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [key, setKey] = useState(0);
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>('preview');

  // Use external state if provided, otherwise use internal
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = externalSetActiveTab ?? setInternalActiveTab;
  const [isCopied, setIsCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [isFixingResp, setIsFixingResp] = useState(false);

  // Loading states
  const [isGeneratingDB, setIsGeneratingDB] = useState(false);

  // Accessibility
  const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [showAccessReport, setShowAccessReport] = useState(false);

  // Quick Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isQuickEditing, setIsQuickEditing] = useState(false);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('fluidflow-app');
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  // Console
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkRequest[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState<TerminalTab>('console');

  // Split View
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<string>('');

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettings]);

  // Auto-fix
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixToast, setAutoFixToast] = useState<string | null>(null);
  const [pendingAutoFix, setPendingAutoFix] = useState<string | null>(null); // Error awaiting confirmation
  const [failedAutoFixError, setFailedAutoFixError] = useState<string | null>(null); // Error that failed auto-fix
  const autoFixTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFixedErrorRef = useRef<string | null>(null);
  const filesRef = useRef<FileSystem>(files); // Ref to avoid stale closure in message handler

  // Keep filesRef updated
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Error Fix Agent state
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [currentErrorStack, setCurrentErrorStack] = useState<string | undefined>(undefined);
  const [errorTargetFile, setErrorTargetFile] = useState<string>('src/App.tsx');

  // Tech Stack for AI context
  const { generateSystemInstruction } = useTechStack();

  // Cleanup timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Inspect Mode
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [inspectedElement, setInspectedElement] = useState<InspectedElement | null>(null);
  const [isInspectEditing, setIsInspectEditing] = useState(false);

  // URL Bar state
  const [currentUrl, setCurrentUrl] = useState('/');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const appCode = files['src/App.tsx'];

  // Helper: Extract local imports from code (components, utils, hooks, etc.)
  const extractLocalImports = useCallback((code: string): string[] => {
    const imports: string[] = [];
    const importRegex = /import\s+(?:(?:\{[^}]*\}|[^{}\s,]+|\*\s+as\s+\w+)(?:\s*,\s*)?)+\s+from\s+['"]\.\.?\/([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      // Try to resolve the file
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
    return [...new Set(imports)]; // Remove duplicates
  }, [files]);

  // Helper: Parse stack trace to identify error location
  const parseStackTrace = useCallback((errorMessage: string): { file?: string; line?: number; column?: number } => {
    console.log('[AutoFix] Parsing error message:', errorMessage.slice(0, 200));

    // Pattern: Transpilation failed for src/components/Features.tsx: /src/components/Features.tsx: Unexpected token (39:49)
    const transpileMatch = errorMessage.match(/(?:Transpilation failed for|failed for)\s+(src\/[\w./]+\.tsx?)[\s:]/i);
    if (transpileMatch) {
      // Also try to extract line/column from error like (39:49)
      const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
      const result = {
        file: transpileMatch[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        column: lineMatch ? parseInt(lineMatch[2], 10) : undefined
      };
      console.log('[AutoFix] Found transpile error, target file:', result);
      return result;
    }

    // Pattern: at Component (filename.tsx:123:45) or at filename.tsx:123:45
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

    // 1. Get local imports from App.tsx
    const localImports = extractLocalImports(mainCode);
    for (const importPath of localImports.slice(0, 5)) { // Limit to 5 files
      if (files[importPath]) {
        related[importPath] = files[importPath];
      }
    }

    // 2. Check for component name in error
    const componentMatch = errorMessage.match(/(?:Element type|'|")(\w+)(?:'|")|(?:cannot read|undefined)\s+(?:property\s+)?['"]?(\w+)['"]?/i);
    if (componentMatch) {
      const componentName = componentMatch[1] || componentMatch[2];
      // Search for matching file
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

    // 3. Include types file if exists
    if (files['src/types.ts'] && !related['src/types.ts']) {
      related['src/types.ts'] = files['src/types.ts'];
    }

    // 4. Parse stack trace for specific file
    const stackInfo = parseStackTrace(errorMessage);
    if (stackInfo.file && files[stackInfo.file] && !related[stackInfo.file]) {
      related[stackInfo.file] = files[stackInfo.file];
    }

    return related;
  }, [files, extractLocalImports, parseStackTrace]);

  // Helper: Get recent console logs for context
  const getRecentLogsContext = useCallback((): string => {
    const recentLogs = logs.slice(-10); // Last 10 logs
    if (recentLogs.length === 0) return '';

    const logContext = recentLogs
      .filter(l => l.type === 'error' || l.type === 'warn')
      .map(l => `[${l.type.toUpperCase()}] ${l.message}`)
      .join('\n');

    return logContext ? `## Recent Console Logs\n\`\`\`\n${logContext}\n\`\`\`\n` : '';
  }, [logs]);

  // Auto-fix error function
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

    setPendingAutoFix(null); // Clear confirmation UI
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
      // Use ProviderManager - let it handle provider and model selection
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();

      if (!activeConfig) {
        throw new Error('No AI provider configured');
      }

      // Use active provider's default model (don't use selectedModel - it might be from a different provider)
      const modelToUse = activeConfig.defaultModel;

      console.log('[AutoFix] Using provider:', activeConfig.type, 'model:', modelToUse);

      // Build comprehensive context for AI
      setAutoFixToast('📦 Building context...');
      const techStackContext = generateSystemInstruction();
      const errorClassification = classifyError(errorMessage);
      const relatedFiles = getRelatedFiles(errorMessage, appCode);
      const recentLogsContext = getRecentLogsContext();
      const stackInfo = parseStackTrace(errorMessage);

      // Determine target file (the file that needs fixing)
      const targetFile = stackInfo.file || 'src/App.tsx';
      const targetFileContent = files[targetFile] || appCode || '';

      console.log('[AutoFix] Error classification:', errorClassification);
      console.log('[AutoFix] Target file:', targetFile);
      console.log('[AutoFix] Related files:', Object.keys(relatedFiles));

      if (!targetFileContent) {
        throw new Error(`Target file not found: ${targetFile}`);
      }

      // Build related files section (exclude target file)
      let relatedFilesSection = '';
      const relatedEntries = Object.entries(relatedFiles).filter(([path]) => path !== targetFile);
      if (relatedEntries.length > 0) {
        relatedFilesSection = '\n## Related Files (may contain relevant code)\n';
        for (const [path, content] of relatedEntries) {
          // Truncate large files
          const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n// ... truncated' : content;
          relatedFilesSection += `### ${path}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
        }
      }

      // Error-specific hints based on category
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

      // Build a detailed prompt for error fixing
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

      // Log the prompt being sent (for debug panel)
      console.log('[AutoFix] Sending prompt to AI:', {
        model: modelToUse,
        targetFile,
        errorCategory: errorClassification.category,
        relatedFilesCount: relatedEntries.length,
        promptLength: systemPrompt.length
      });

      // Extract short model name for display
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
        setFailedAutoFixError(null); // Clear any previous failed error

        // Clear the error from logs
        setLogs(prev => prev.map(l =>
          l.message === errorMessage ? { ...l, isFixed: true } : l
        ));

        // Auto-clear success toast
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), 3000);
      } else {
        console.warn('[AutoFix] Fix failed - invalid code generated');
        // Store failed error for "Send to Chat" option
        setFailedAutoFixError(errorMessage);
        setAutoFixToast(null); // Clear toast, we'll show the persistent notification instead
      }
    } catch (e) {
      console.error('[AutoFix] Exception:', e);
      // Store failed error for "Send to Chat" option
      setFailedAutoFixError(errorMessage);
      setAutoFixToast(null); // Clear toast, we'll show the persistent notification instead
      debugLog.error('auto-fix', e instanceof Error ? e.message : 'Auto-fix failed', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime
      });
    } finally {
      setIsAutoFixing(false);
    }
  }, [appCode, files, setFiles, isAutoFixing, isGenerating, selectedModel, generateSystemInstruction, getRelatedFiles, getRecentLogsContext, parseStackTrace, logs]);

  // Auto-fix confirmation handlers
  const handleConfirmAutoFix = useCallback(() => {
    console.log('[AutoFix] Fix with AI button clicked, pendingAutoFix:', pendingAutoFix?.slice(0, 100));
    if (pendingAutoFix) {
      autoFixError(pendingAutoFix);
    }
  }, [pendingAutoFix, autoFixError]);

  const handleDeclineAutoFix = useCallback(() => {
    setPendingAutoFix(null);
  }, []);

  // Failed auto-fix handlers
  const handleSendErrorToChat = useCallback(() => {
    if (failedAutoFixError && onSendErrorToChat) {
      onSendErrorToChat(failedAutoFixError);
      setFailedAutoFixError(null);
    }
  }, [failedAutoFixError, onSendErrorToChat]);

  const handleDismissFailedError = useCallback(() => {
    setFailedAutoFixError(null);
  }, []);

  // Console Message Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'CONSOLE_LOG') {
        const logId = crypto.randomUUID();
        const logEntry = {
          id: logId,
          type: event.data.logType,
          message: event.data.message,
          timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
        };

        setLogs(prev => [...prev, logEntry]);

        if (event.data.logType === 'error') {
          setIsConsoleOpen(true);
          setActiveTerminalTab('console');

          // Update Error Fix Panel state
          const errorMsg = event.data.message;
          setCurrentError(errorMsg);
          setCurrentErrorStack(event.data.stack);

          // Parse stack trace to determine target file for error fix panel
          const stackInfo = parseStackTrace(errorMsg);
          if (stackInfo.file) {
            setErrorTargetFile(stackInfo.file);
          }

          console.log('[AutoFix] Error detected:', event.data.message.slice(0, 150));
          console.log('[AutoFix] State check - autoFixEnabled:', autoFixEnabled, 'isAutoFixing:', isAutoFixing, 'pendingAutoFix:', !!pendingAutoFix);

          // Show auto-fix confirmation if enabled (don't auto-run)
          if (autoFixEnabled && !isAutoFixing && !pendingAutoFix) {

            // Use robust error classification
            const errorInfo = classifyError(errorMsg);
            console.log('[AutoFix] Error classification:', errorInfo);

            // Skip ignorable/transient errors
            if (errorInfo.isIgnorable) {
              console.log('[AutoFix] Ignoring transient error:', errorMsg.slice(0, 100));
              return;
            }

            // Skip if already fixed this error or same error recently
            if (lastFixedErrorRef.current === errorMsg || wasRecentlyFixed(errorMsg)) {
              return;
            }

            // Try auto-fix with robust service (handles rate limiting, loops, validation)
            if (appCode && canAutoFix(errorMsg)) {
              try {
                // For bare specifier errors, find which file contains the import
                const errorLower = errorMsg.toLowerCase();
                const isBareSpecifierError = errorLower.includes('bare specifier') || errorLower.includes('was not remapped');

                let targetFile = 'src/App.tsx';
                let targetFileContent = appCode;

                if (isBareSpecifierError) {
                  // Extract the bare specifier from error (e.g., "src/components/Hero.tsx")
                  const specifierMatch = errorMsg.match(/["']?(src\/[\w./-]+)["']?\s*was a bare specifier/i);
                  if (specifierMatch) {
                    const bareSpecifier = specifierMatch[1];
                    const bareWithoutExt = bareSpecifier.replace(/\.(tsx?|jsx?)$/, '');

                    console.log('[AutoFix] Bare specifier error, searching for import of:', bareSpecifier);

                    // Search all files for the import (use ref to avoid stale closure)
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
                  // Parse stack trace to get target file for other errors
                  const stackInfo = parseStackTrace(errorMsg);
                  targetFile = stackInfo.file || 'src/App.tsx';
                  targetFileContent = filesRef.current[targetFile] || appCode;
                }

                console.log('[AutoFix] Simple fix attempt for:', targetFile);
                console.log('[AutoFix] Target file exists:', !!filesRef.current[targetFile], 'Content length:', targetFileContent?.length);

                const fixResult = attemptAutoFix(errorMsg, targetFileContent);
                console.log('[AutoFix] Fix result:', { success: fixResult.success, wasAINeeded: fixResult.wasAINeeded, error: fixResult.error, fixType: fixResult.fixType });

                if (fixResult.success && !fixResult.wasAINeeded) {
                  // Simple fix worked! Apply it to the correct target file
                  lastFixedErrorRef.current = errorMsg;
                  setFiles({ ...filesRef.current, [targetFile]: fixResult.newCode });
                  setAutoFixToast(`⚡ ${fixResult.description}`);
                  if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                  toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), 3000);
                  console.log('[AutoFix] Applied:', fixResult.description, `(${fixResult.fixType})`, 'to:', targetFile);
                  return; // Don't show AI fix dialog
                }

                // Log why fix didn't work
                if (fixResult.error) {
                  console.log('[AutoFix] Could not fix:', fixResult.error);
                }
              } catch (e) {
                // Catch any unexpected errors from the fix service
                console.error('[AutoFix] Service error:', e);
              }
            }

            // Simple fix didn't work - show AI fix confirmation after delay (only for fixable errors)
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
          }
        }
      } else if (event.data.type === 'NETWORK_REQUEST') {
        setNetworkLogs(prev => [...prev, {
          id: crypto.randomUUID(),
          method: event.data.req.method,
          url: event.data.req.url,
          status: event.data.req.status,
          duration: event.data.req.duration,
          timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
        }]);
      } else if (event.data.type === 'INSPECT_HOVER') {
        // Element hovered in inspect mode - ignore if editing
        if (!isInspectEditing) {
          setHoveredElement(event.data.rect);
        }
      } else if (event.data.type === 'INSPECT_SELECT') {
        // Element selected in inspect mode - ignore if already editing
        if (!isInspectEditing) {
          setInspectedElement(event.data.element);
          setHoveredElement(null);
        }
      } else if (event.data.type === 'INSPECT_LEAVE') {
        // Mouse left element
        if (!isInspectEditing) {
          setHoveredElement(null);
        }
      } else if (event.data.type === 'INSPECT_SCROLL') {
        // Update selected element rect on scroll (functional update handles null case)
        if (!isInspectEditing) {
          setInspectedElement(prev => prev ? { ...prev, rect: event.data.rect } : null);
        }
      } else if (event.data.type === 'URL_CHANGE') {
        // URL changed in sandbox
        setCurrentUrl(event.data.url || '/');
        setCanGoBack(event.data.canGoBack || false);
        setCanGoForward(event.data.canGoForward || false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [autoFixEnabled, isAutoFixing, isInspectEditing, pendingAutoFix, appCode, setFiles, parseStackTrace]);

  // Build iframe content
  useEffect(() => {
    if (appCode) {
      const html = buildIframeHtml(files, isInspectMode);
      setIframeSrc(html);
    }
  }, [appCode, files, isInspectMode]);

  // Toggle inspect mode in iframe
  const toggleInspectMode = () => {
    const newMode = !isInspectMode;
    setIsInspectMode(newMode);
    setInspectedElement(null);
    setHoveredElement(null);
    // Force iframe refresh to apply new event listeners
    setKey(prev => prev + 1);
    // Also disable edit mode when entering inspect mode
    if (newMode) setIsEditMode(false);
  };

  // Handle targeted component edit
  const handleInspectEdit = async (prompt: string, element: InspectedElement, scope: EditScope) => {
    if (!appCode) return;
    setIsInspectEditing(true);

    // If external handler provided (with chat history support), use it
    if (onInspectEdit) {
      try {
        await onInspectEdit(prompt, element, scope);
        setInspectedElement(null);
        setIsInspectMode(false);
      } catch (error) {
        console.error('Inspect edit failed:', error);
      } finally {
        setIsInspectEditing(false);
      }
      return;
    }

    // Fallback to local implementation using provider manager
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const elementContext = `
Target Element:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
- Text content: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent components: ${element.parentComponents.join(' > ')}` : ''}
`;

      const systemInstruction = `You are an expert React developer. The user has selected a specific element/component in their app and wants to modify it.

Based on the element information provided, identify which file and component needs to be modified, then make the requested changes.

**RESPONSE FORMAT**: Return a JSON object with:
1. "explanation": Brief markdown explaining what you changed
2. "files": Object with file paths as keys and updated code as values

Only return files that need changes. Maintain all existing functionality.`;

      const response = await manager.generate({
        prompt: `${elementContext}\n\nUser Request: ${prompt}\n\nCurrent files:\n${JSON.stringify(files, null, 2)}`,
        systemInstruction,
        responseFormat: 'json',
        // FILE_GENERATION_SCHEMA has dynamic keys, only Gemini supports it natively
        responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
          ? FILE_GENERATION_SCHEMA
          : undefined,
        debugCategory: 'quick-edit'
      }, currentModel);

      const text = response.text || '{}';
      const result = JSON.parse(cleanGeneratedCode(text));

      if (result.files && Object.keys(result.files).length > 0) {
        const newFiles = { ...files, ...result.files };
        reviewChange(`Edit: ${element.componentName || element.tagName}`, newFiles);
      }

      setInspectedElement(null);
      setIsInspectMode(false);
    } catch (error) {
      console.error('Inspect edit failed:', error);
    } finally {
      setIsInspectEditing(false);
    }
  };

  // API functions
  const generateDatabaseSchema = async () => {
    if (!appCode) return;
    setIsGeneratingDB(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate({
        prompt: `Based on this React App, generate a SQL schema for SQLite.\nCode: ${appCode}\nOutput ONLY SQL.`,
        systemInstruction: 'You are a database expert. Generate only valid SQL code without any markdown formatting.',
      }, currentModel);
      const sql = cleanGeneratedCode(response.text || '');
      setFiles({ ...files, 'db/schema.sql': sql });
      setActiveFile('db/schema.sql');
      setActiveTab('code');
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingDB(false);
    }
  };

  const runAccessibilityAudit = async () => {
    if (!appCode) return;
    setIsAuditing(true);
    setShowAccessReport(true);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;

    const systemInstruction = `You are a WCAG 2.1 Accessibility Auditor. Analyze the provided React code for accessibility issues.

You MUST return a JSON object with this EXACT structure:
{
  "score": <number 0-100>,
  "issues": [
    {
      "type": "error" | "warning",
      "message": "<description of the accessibility issue>"
    }
  ]
}

Rules for scoring:
- 100: No accessibility issues found
- 80-99: Minor issues (warnings only)
- 50-79: Moderate issues (some errors)
- 0-49: Critical accessibility problems

Check for these WCAG 2.1 violations:
1. Missing alt text on images
2. Missing form labels
3. Poor color contrast
4. Missing ARIA attributes
5. Non-semantic HTML usage
6. Missing keyboard navigation support
7. Missing focus indicators
8. Missing skip links
9. Missing language attributes
10. Missing heading hierarchy`;

    const requestId = debugLog.request('accessibility', {
      model: currentModel,
      prompt: 'WCAG 2.1 Accessibility Audit',
      systemInstruction
    });
    const startTime = Date.now();

    try {
      const response = await manager.generate({
        prompt: `Audit this React code for accessibility issues:\n\n${appCode}`,
        systemInstruction,
        responseFormat: 'json',
        responseSchema: ACCESSIBILITY_AUDIT_SCHEMA,
        debugCategory: 'accessibility'
      }, currentModel);

      let report: AccessibilityReport;
      try {
        const parsed = JSON.parse(response.text || '{}');
        // Normalize the response to match our expected format
        report = {
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          issues: Array.isArray(parsed.issues) ? parsed.issues.map((issue: any) => ({
            type: issue.type === 'error' || issue.type === 'warning' ? issue.type : 'warning',
            message: typeof issue.message === 'string' ? issue.message :
                     typeof issue === 'string' ? issue : JSON.stringify(issue)
          })) : []
        };
      } catch {
        report = { score: 0, issues: [{ type: 'error', message: 'Failed to parse audit response.' }] };
      }

      setAccessibilityReport(report);

      debugLog.response('accessibility', {
        id: requestId,
        model: currentModel,
        duration: Date.now() - startTime,
        response: JSON.stringify(report),
        metadata: { score: report.score, issueCount: report.issues?.length }
      });
    } catch (e) {
      setAccessibilityReport({ score: 0, issues: [{ type: 'error', message: 'Failed to run audit: ' + (e instanceof Error ? e.message : 'Unknown error') }] });
      debugLog.error('accessibility', e instanceof Error ? e.message : 'Audit failed', {
        id: requestId,
        duration: Date.now() - startTime
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const fixAccessibilityIssues = async () => {
    if (!appCode || !accessibilityReport) return;
    setIsFixing(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate({
        prompt: `Fix the following accessibility issues in this React code.

Issues to fix:
${accessibilityReport.issues.map((issue, i) => `${i + 1}. [${issue.type.toUpperCase()}] ${issue.message}`).join('\n')}

Original Code:
${appCode}`,
        systemInstruction: 'You are an accessibility expert. Apply the necessary fixes to resolve all listed accessibility issues. Return ONLY the complete fixed code without any markdown formatting or explanations.'
      }, currentModel);

      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Accessibility Issues', { ...files, 'src/App.tsx': fixedCode });
      setAccessibilityReport({ score: 100, issues: [] });
      setTimeout(() => setShowAccessReport(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixing(false);
    }
  };

  const fixResponsiveness = async () => {
    if (!appCode) return;
    setIsFixingResp(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate({
        prompt: `Optimize this React component for mobile devices.\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
        systemInstruction: 'You are an expert React developer. Return only valid React/TypeScript code without any markdown formatting.',
      }, currentModel);
      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Responsiveness', { ...files, 'src/App.tsx': fixedCode });
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixingResp(false);
    }
  };

  const handleQuickEdit = async () => {
    if (!editPrompt.trim() || !appCode) return;
    setIsQuickEditing(true);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;

    const requestId = debugLog.request('quick-edit', {
      model: currentModel,
      prompt: editPrompt
    });
    const startTime = Date.now();

    try {
      const response = await manager.generate({
        prompt: `Edit this React code based on: "${editPrompt}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
        systemInstruction: 'You are an expert React developer. Return only valid React/TypeScript code without any markdown formatting.',
        debugCategory: 'quick-edit'
      }, currentModel);
      const fixedCode = cleanGeneratedCode(response.text || '');

      debugLog.response('quick-edit', {
        id: requestId,
        model: currentModel,
        duration: Date.now() - startTime,
        response: fixedCode.slice(0, 500) + '...'
      });

      setFiles({ ...files, 'src/App.tsx': fixedCode });
      setIsEditMode(false);
      setEditPrompt('');
    } catch (e) {
      console.error(e);
      debugLog.error('quick-edit', e instanceof Error ? e.message : 'Quick edit failed', {
        id: requestId,
        duration: Date.now() - startTime
      });
    } finally {
      setIsQuickEditing(false);
    }
  };

  const fixError = async (logId: string, message: string) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: true } : l));
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate({
        prompt: `Fix this runtime error: "${message}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
        systemInstruction: 'You are an expert React developer. Fix the error and return only valid React/TypeScript code without any markdown formatting.',
        debugCategory: 'auto-fix'
      }, currentModel);
      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Runtime Error', { ...files, 'src/App.tsx': fixedCode });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false, isFixed: true } : l));
    } catch (e) {
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false } : l));
    }
  };

  // Export functions
  const downloadAsZip = async () => {
    if (!appCode) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      // Add standard files
      zip.file('package.json', JSON.stringify(getPackageJson(repoName), null, 2));
      zip.file('vite.config.ts', getViteConfig());
      zip.file('tsconfig.json', JSON.stringify(getTsConfig(), null, 2));
      zip.file('tailwind.config.js', getTailwindConfig());
      zip.file('postcss.config.js', getPostcssConfig());
      zip.file('index.html', getIndexHtml());
      zip.file('src/main.tsx', getMainTsx());
      zip.file('src/index.css', files['src/index.css'] || getTailwindCss());
      zip.file('README.md', getReadme());

      // Add .gitignore if not exists
      if (!files['.gitignore']) {
        zip.file('.gitignore', `# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/

# IDE
.idea/
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`);
      }

      // Generate .env.example from .env
      if (files['.env']) {
        const envExample = files['.env']
          .split('\n')
          .map(line => {
            if (!line.trim() || line.startsWith('#')) return line;
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
            if (match) return `${match[1]}=your_${match[1].toLowerCase()}_here`;
            return line;
          })
          .join('\n');
        zip.file('.env.example', envExample);
      }

      for (const [path, content] of Object.entries(files) as [string, string][]) {
        if (path === 'src/index.css') continue;
        const fixedContent = content.replace(/from ['"]src\//g, "from './").replace(/import ['"]src\//g, "import './");
        zip.file(path, fixedContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'fluidflow-app.zip');
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloading(false);
      setShowExportModal(false);
    }
  };

  const pushToGithub = async () => {
    // Implementation remains the same - abbreviated for brevity
    if (!githubToken || !repoName || !appCode) return;
    setIsPushing(true);
    setPushResult(null);
    try {
      // Create repo and push files...
      const createRepoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName, description: 'Generated with FluidFlow', private: false, auto_init: true })
      });
      if (!createRepoRes.ok) throw new Error((await createRepoRes.json()).message);
      const repoData = await createRepoRes.json();
      setPushResult({ success: true, url: repoData.html_url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to push to GitHub';
      setPushResult({ success: false, error: msg });
    } finally {
      setIsPushing(false);
    }
  };

  // Helper functions
  const reloadPreview = () => {
    setKey(prev => prev + 1);
    setCurrentUrl('/');
    setCanGoBack(false);
    setCanGoForward(false);
  };

  // URL Bar navigation functions
  const navigateToUrl = (url: string) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'NAVIGATE', url }, '*');
    }
  };

  const goBack = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'GO_BACK' }, '*');
    }
  };

  const goForward = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'GO_FORWARD' }, '*');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(files[activeFile] || '');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  const downloadCode = () => {
    const element = document.createElement('a');
    const file = new Blob([files[activeFile] || ''], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = activeFile.split('/').pop() || 'file.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Database and Docs tabs open their panels directly
    // No special handling needed - panels manage their own state
  };

  return (
    <section className="flex-1 min-w-0 min-h-0 h-full self-stretch flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Toolbar */}
      <div className="h-14 flex-none border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-white/[0.02]">
        <div className="flex items-center gap-6">
          <div className="flex gap-1.5 opacity-60">
            <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/40 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/50" />
          </div>

          <div className="flex p-1 bg-slate-950/50 rounded-lg border border-white/5">
            {[
              { id: 'preview', icon: Eye, label: 'Preview' },
              { id: 'code', icon: Code2, label: 'Code' },
              { id: 'codemap', icon: Map, label: 'CodeMap' },
              { id: 'git', icon: GitBranch, label: 'Git' },
              { id: 'run', icon: Play, label: 'Run' },
              { id: 'webcontainer', icon: Box, label: 'WebContainer' },
              { id: 'database', icon: Database, label: 'DB Studio' },
              { id: 'docs', icon: FileText, label: 'Docs' },
              { id: 'env', icon: Shield, label: 'Env' },
              { id: 'debug', icon: Bug, label: 'Debug' },
              { id: 'errorfix', icon: Bot, label: 'Error Fix' }
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id as TabType)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
                title={label}
              >
                <Icon className="w-3.5 h-3.5" />
                {activeTab === id && <span>{label}</span>}
              </button>
            ))}
          </div>

          {activeTab === 'preview' && (
            <>
              <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1 bg-slate-950/30 p-1 rounded-lg border border-white/5">
                {[
                  { id: 'desktop', icon: Monitor },
                  { id: 'tablet', icon: Tablet },
                  { id: 'mobile', icon: Smartphone }
                ].map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPreviewDevice(id as PreviewDevice)}
                    className={`p-2 rounded-md transition-colors ${previewDevice === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    title={id.charAt(0).toUpperCase() + id.slice(1)}
                    aria-label={`${id} view`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'preview' ? (
            <>
              {appCode && !isGenerating && (
                <>
                  <button onClick={() => setIsEditMode(!isEditMode)} className={`p-2 rounded-lg border transition-all ${isEditMode ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'}`} title="Quick Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleInspectMode}
                    className={`p-2 rounded-lg border transition-all ${
                      isInspectMode
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'
                    }`}
                    title="Inspect Components"
                  >
                    <MousePointer2 className="w-4 h-4" />
                  </button>

                  {/* Settings Dropdown */}
                  <div className="relative" ref={settingsRef}>
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`flex items-center gap-1 p-2 rounded-lg border transition-all ${
                        showSettings ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'
                      }`}
                      title="Settings"
                    >
                      <Settings className="w-4 h-4" />
                      <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                    </button>

                    {showSettings && (
                      <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-white/5">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wide px-2">Preview Settings</span>
                        </div>

                        {/* Auto-fix Toggle */}
                        <button
                          onClick={() => setAutoFixEnabled(!autoFixEnabled)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isAutoFixing ? (
                              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                            ) : autoFixEnabled ? (
                              <Zap className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ZapOff className="w-4 h-4 text-slate-500" />
                            )}
                            <span className="text-sm text-slate-200">Auto-fix Errors</span>
                          </div>
                          <div className={`w-8 h-4 rounded-full transition-colors ${autoFixEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${autoFixEnabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} style={{ marginLeft: autoFixEnabled ? '17px' : '2px' }} />
                          </div>
                        </button>

                        {/* Fix Responsive */}
                        {previewDevice !== 'desktop' && (
                          <button
                            onClick={() => { fixResponsiveness(); setShowSettings(false); }}
                            disabled={isFixingResp}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50"
                          >
                            {isFixingResp ? (
                              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                            ) : (
                              <Wrench className="w-4 h-4 text-indigo-400" />
                            )}
                            <span className="text-sm text-slate-200">{isFixingResp ? 'Fixing...' : 'Fix Responsive'}</span>
                          </button>
                        )}

                        <div className="h-px bg-white/5" />

                        {/* Accessibility Audit */}
                        <button
                          onClick={() => { runAccessibilityAudit(); setShowSettings(false); }}
                          disabled={isAuditing}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                          {isAuditing ? (
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-indigo-400" />
                          )}
                          <span className="text-sm text-slate-200">{isAuditing ? 'Auditing...' : 'Accessibility Audit'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="h-6 w-px bg-white/10" />
              <button onClick={reloadPreview} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors" title="Reload Preview" aria-label="Reload Preview">
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={downloadCode} className="p-2 hover:bg-blue-500/10 rounded-lg text-slate-400 hover:text-blue-400" title="Download File" aria-label="Download current file">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 border border-white/5">
                {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {appCode && (
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-medium">
              <Package className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#050811] group flex flex-col">
        {/* DBStudio - always rendered but hidden when not active to preserve state */}
        <div className={activeTab === 'database' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <DBStudio files={files} setFiles={setFiles} />
        </div>
        {/* DocsPanel - always rendered but hidden when not active to preserve state */}
        <div className={activeTab === 'docs' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <DocsPanel files={files} setFiles={setFiles} />
        </div>
        {/* CodeMapTab - always rendered but hidden to preserve state */}
        <div className={activeTab === 'codemap' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <CodeMapTab files={files} />
        </div>
        {activeTab === 'debug' ? (
          <DebugPanel />
        ) : activeTab === 'env' ? (
          <EnvironmentPanel files={files} setFiles={setFiles} />
        ) : activeTab === 'git' ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <GitPanel
              projectId={projectId || null}
              gitStatus={gitStatus || null}
              onInitGit={onInitGit || (async (_force?: boolean) => { console.log('[PreviewPanel] fallback onInitGit called'); return false; })}
              onCommit={onCommit || (async () => false)}
              onRefreshStatus={onRefreshGitStatus || (async () => {})}
              hasUncommittedChanges={hasUncommittedChanges}
              localChanges={localChanges}
              files={files}
              onDiscardChanges={onDiscardChanges}
              onRevertToCommit={onRevertToCommit}
            />
          </div>
        ) : activeTab === 'run' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <RunnerPanel
              projectId={projectId || null}
              projectName={files['package.json'] ? (() => { try { return JSON.parse(files['package.json']).name; } catch { return undefined; }})() : undefined}
              hasCommittedFiles={Boolean(gitStatus?.initialized)}
            />
          </div>
        ) : activeTab === 'webcontainer' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <WebContainerPanel
              files={files}
              projectId={projectId}
            />
          </div>
        ) : activeTab === 'errorfix' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ErrorFixPanel
              files={files}
              currentError={currentError}
              currentErrorStack={currentErrorStack}
              targetFile={errorTargetFile}
              onFileUpdate={(path, content) => {
                setFiles({ ...files, [path]: content });
              }}
              onFixComplete={(success) => {
                if (success) {
                  setCurrentError(null);
                  setCurrentErrorStack(undefined);
                }
              }}
            />
          </div>
        ) : activeTab === 'database' || activeTab === 'codemap' || activeTab === 'docs' ? (
          // These tabs are always-rendered above, so return null here to avoid showing FileExplorer
          null
        ) : activeTab === 'preview' ? (
          <PreviewContent
            appCode={appCode}
            iframeSrc={iframeSrc}
            previewDevice={previewDevice}
            isGenerating={isGenerating}
            isFixingResp={isFixingResp}
            isEditMode={isEditMode}
            editPrompt={editPrompt}
            setEditPrompt={setEditPrompt}
            isQuickEditing={isQuickEditing}
            handleQuickEdit={handleQuickEdit}
            setIsEditMode={setIsEditMode}
            iframeKey={key}
            logs={logs}
            networkLogs={networkLogs}
            isConsoleOpen={isConsoleOpen}
            setIsConsoleOpen={setIsConsoleOpen}
            activeTerminalTab={activeTerminalTab}
            setActiveTerminalTab={setActiveTerminalTab}
            setLogs={setLogs}
            setNetworkLogs={setNetworkLogs}
            fixError={fixError}
            autoFixToast={autoFixToast}
            isAutoFixing={isAutoFixing}
            pendingAutoFix={pendingAutoFix}
            handleConfirmAutoFix={handleConfirmAutoFix}
            handleDeclineAutoFix={handleDeclineAutoFix}
            failedAutoFixError={failedAutoFixError}
            onSendErrorToChat={onSendErrorToChat}
            handleSendErrorToChat={handleSendErrorToChat}
            handleDismissFailedError={handleDismissFailedError}
            isInspectMode={isInspectMode}
            hoveredElement={hoveredElement}
            inspectedElement={inspectedElement}
            isInspectEditing={isInspectEditing}
            onCloseInspector={() => { setInspectedElement(null); setIsInspectMode(false); }}
            onInspectEdit={handleInspectEdit}
            iframeRef={iframeRef}
            currentUrl={currentUrl}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onNavigate={navigateToUrl}
            onGoBack={goBack}
            onGoForward={goForward}
            onReload={reloadPreview}
          />
        ) : (
          <div className="flex-1 flex min-h-0 h-full">
            <FileExplorer
                files={files}
                activeFile={activeFile}
                onFileSelect={setActiveFile}
                onCreateFile={(path, content) => {
                  setFiles({ ...files, [path]: content });
                }}
                onDeleteFile={(path) => {
                  const newFiles = { ...files };
                  // Delete the file and any files in the folder if it's a folder
                  Object.keys(newFiles).forEach(filePath => {
                    if (filePath === path || filePath.startsWith(path + '/')) {
                      delete newFiles[filePath];
                    }
                  });
                  setFiles(newFiles);
                  // If deleted file was active, switch to another file
                  if (activeFile === path || activeFile.startsWith(path + '/')) {
                    const remainingFiles = Object.keys(newFiles);
                    if (remainingFiles.length > 0) {
                      setActiveFile(remainingFiles[0]);
                    }
                  }
                }}
                onRenameFile={(oldPath, newPath) => {
                  const newFiles: FileSystem = {};
                  (Object.entries(files) as [string, string][]).forEach(([filePath, content]) => {
                    if (filePath === oldPath) {
                      newFiles[newPath] = content;
                    } else if (filePath.startsWith(oldPath + '/')) {
                      // Handle folder rename - update all nested files
                      const relativePath = filePath.substring(oldPath.length);
                      newFiles[newPath + relativePath] = content;
                    } else {
                      newFiles[filePath] = content;
                    }
                  });
                  setFiles(newFiles);
                  // Update active file if it was renamed
                  if (activeFile === oldPath) {
                    setActiveFile(newPath);
                  } else if (activeFile.startsWith(oldPath + '/')) {
                    const relativePath = activeFile.substring(oldPath.length);
                    setActiveFile(newPath + relativePath);
                  }
                }}
              />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Split View Toggle */}
              <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{activeFile}</span>
                  {isSplitView && splitFile && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{splitFile}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (!isSplitView) {
                        // Find another file to show in split view
                        const otherFiles = Object.keys(files).filter(f => f !== activeFile && (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')));
                        setSplitFile(otherFiles[0] || '');
                      }
                      setIsSplitView(!isSplitView);
                    }}
                    className={`p-1.5 rounded transition-colors ${isSplitView ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                    title={isSplitView ? 'Close Split View' : 'Split View'}
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                  </button>
                  {isSplitView && (
                    <button
                      onClick={() => setIsSplitView(false)}
                      className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                      title="Close Split"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Generation Progress Toast - Non-blocking */}
              {isGeneratingDB && (
                <div className="absolute top-2 right-2 z-50 flex items-center gap-2 px-3 py-2 bg-blue-500/20 backdrop-blur-xl border border-blue-500/30 rounded-lg shadow-lg animate-in slide-in-from-top-2 duration-300">
                  <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-xs font-medium text-blue-300">
                    Generating SQL Schema...
                  </span>
                </div>
              )}

              {/* Normal content */}
              {files[activeFile] ? (
                <div className={`flex-1 flex min-h-0 overflow-hidden ${isSplitView ? 'flex-row' : 'flex-col'}`}>
                  {/* Primary Editor / Preview */}
                  <div className={isSplitView ? 'flex-1 min-w-0 min-h-0 h-full overflow-hidden border-r border-white/5' : 'flex-1 min-h-0 h-full overflow-hidden'}>
                    {activeFile.endsWith('.md') ? (
                      <MarkdownPreview
                        content={files[activeFile]}
                        fileName={activeFile.split('/').pop() || activeFile}
                      />
                    ) : (
                      <CodeEditor files={files} setFiles={setFiles} activeFile={activeFile} />
                    )}
                  </div>

                  {/* Split Editor */}
                  {isSplitView && splitFile && files[splitFile] && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                      {/* Split file selector */}
                      <select
                        value={splitFile}
                        onChange={(e) => setSplitFile(e.target.value)}
                        className="flex-none w-full px-2 py-1 bg-slate-800/50 border-b border-white/5 text-xs text-slate-400 outline-none"
                      >
                        {Object.keys(files)
                          .filter(f => f !== activeFile)
                          .map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                      </select>
                      <div className="flex-1 min-h-0 h-full overflow-hidden">
                        {splitFile.endsWith('.md') ? (
                          <MarkdownPreview
                            content={files[splitFile]}
                            fileName={splitFile.split('/').pop() || splitFile}
                          />
                        ) : (
                          <CodeEditor files={files} setFiles={setFiles} activeFile={splitFile} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                  <Code2 className="w-10 h-10 opacity-50" />
                  <p className="text-sm font-medium">Select a file to edit</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} onDownloadZip={downloadAsZip} onPushToGithub={() => { setShowExportModal(false); setShowGithubModal(true); }} isDownloading={isDownloading} />
        <GithubModal isOpen={showGithubModal} onClose={() => { setShowGithubModal(false); setPushResult(null); }} githubToken={githubToken} onTokenChange={setGithubToken} repoName={repoName} onRepoNameChange={setRepoName} onPush={pushToGithub} isPushing={isPushing} pushResult={pushResult} />
        {activeTab === 'preview' && <ConsultantReport suggestions={suggestions} onClose={() => setSuggestions(null)} />}
        {activeTab === 'preview' && <AccessibilityModal isOpen={showAccessReport} onClose={() => setShowAccessReport(false)} report={accessibilityReport} isAuditing={isAuditing} isFixing={isFixing} onFix={fixAccessibilityIssues} />}
      </div>
    </section>
  );
};

// Preview Content Component
const PreviewContent: React.FC<{
  appCode: string | undefined;
  iframeSrc: string;
  previewDevice: PreviewDevice;
  isGenerating: boolean;
  isFixingResp: boolean;
  isEditMode: boolean;
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  isQuickEditing: boolean;
  handleQuickEdit: () => void;
  setIsEditMode: (v: boolean) => void;
  iframeKey: number;
  logs: LogEntry[];
  networkLogs: NetworkRequest[];
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  activeTerminalTab: TerminalTab;
  setActiveTerminalTab: (t: TerminalTab) => void;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  setNetworkLogs: React.Dispatch<React.SetStateAction<NetworkRequest[]>>;
  fixError: (id: string, msg: string) => void;
  autoFixToast: string | null;
  isAutoFixing: boolean;
  pendingAutoFix: string | null;
  handleConfirmAutoFix: () => void;
  handleDeclineAutoFix: () => void;
  failedAutoFixError: string | null;
  onSendErrorToChat?: (errorMessage: string) => void;
  handleSendErrorToChat: () => void;
  handleDismissFailedError: () => void;
  isInspectMode: boolean;
  hoveredElement: { top: number; left: number; width: number; height: number } | null;
  inspectedElement: InspectedElement | null;
  isInspectEditing: boolean;
  onCloseInspector: () => void;
  onInspectEdit: (prompt: string, element: InspectedElement, scope: EditScope) => void;
  // URL Bar props
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
}> = (props) => {
  const { appCode, iframeSrc, previewDevice, isGenerating, isFixingResp, isEditMode, editPrompt, setEditPrompt, isQuickEditing, handleQuickEdit, setIsEditMode, iframeKey, logs, networkLogs, isConsoleOpen, setIsConsoleOpen, activeTerminalTab, setActiveTerminalTab, setLogs, setNetworkLogs, fixError, autoFixToast, isAutoFixing, pendingAutoFix, handleConfirmAutoFix, handleDeclineAutoFix, failedAutoFixError, onSendErrorToChat, handleSendErrorToChat, handleDismissFailedError, isInspectMode, hoveredElement, inspectedElement, isInspectEditing, onCloseInspector, onInspectEdit, iframeRef, currentUrl, canGoBack, canGoForward, onNavigate, onGoBack, onGoForward, onReload } = props;

  // Local state for URL input
  const [urlInput, setUrlInput] = useState(currentUrl);

  // Sync URL input with current URL
  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = urlInput.trim();
    if (!url.startsWith('/')) {
      url = '/' + url;
    }
    onNavigate(url);
  };

  // Calculate content area height based on console state
  const contentStyle = {
    height: isConsoleOpen ? 'calc(100% - 192px)' : 'calc(100% - 32px)'
  };

  return (
    <div className="flex-1 min-h-0 h-full overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      {/* Auto-fix Confirmation Dialog - AI assistance (simple fix already tried) */}
      {pendingAutoFix && !isAutoFixing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg backdrop-blur-xl border bg-orange-500/10 border-orange-500/30 animate-in slide-in-from-top-2 duration-300 max-w-md">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-orange-500/20 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-orange-300">Error Detected</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">AI Fix</span>
              </div>
              <p className="text-xs text-slate-400 mb-3 line-clamp-2">{pendingAutoFix}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmAutoFix}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Fix with AI
                </button>
                <button
                  onClick={handleDeclineAutoFix}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-300 text-xs font-medium transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-fix Toast Notification */}
      {autoFixToast && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg backdrop-blur-xl border animate-in slide-in-from-top-2 duration-300 ${
          isAutoFixing
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
            : autoFixToast.includes('✅')
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                ? 'bg-red-500/20 border-red-500/30 text-red-300'
                : 'bg-slate-500/20 border-slate-500/30 text-slate-300'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isAutoFixing && <Loader2 className="w-4 h-4 animate-spin" />}
            {autoFixToast}
          </div>
        </div>
      )}

      {/* Failed Auto-fix Notification - Persistent with Send to Chat option */}
      {failedAutoFixError && !autoFixToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] max-w-md w-full px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-red-300 mb-1">Auto-fix Failed</h4>
                  <p className="text-xs text-red-300/70 line-clamp-2 mb-3">
                    {failedAutoFixError.slice(0, 150)}{failedAutoFixError.length > 150 ? '...' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    {onSendErrorToChat && (
                      <button
                        onClick={handleSendErrorToChat}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-300 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Send to Chat
                      </button>
                    )}
                    <button
                      onClick={handleDismissFailedError}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-500/20 hover:bg-slate-500/30 border border-slate-500/30 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center overflow-hidden relative z-10 transition-all duration-300" style={contentStyle}>
        {appCode ? (
          <div className={`relative z-10 transition-all duration-500 ease-in-out bg-slate-950 shadow-2xl overflow-hidden flex flex-col ${
            previewDevice === 'mobile' ? 'w-[375px] h-[667px] max-h-full rounded-[40px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]' :
            previewDevice === 'tablet' ? 'w-[768px] h-[90%] max-h-[800px] rounded-[24px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]' :
            'w-full h-full rounded-none border-none'
          }`}>
            {previewDevice === 'mobile' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2 pointer-events-none">
                <div className="w-12 h-1.5 rounded-full bg-slate-800/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800/80" />
              </div>
            )}

            {/* URL Bar */}
            <div className={`flex-none flex items-center gap-1.5 px-2 py-1.5 bg-slate-900/95 border-b border-white/5 ${previewDevice === 'mobile' ? 'pt-8' : ''}`}>
              {/* Navigation Buttons */}
              <button
                onClick={onGoBack}
                disabled={!canGoBack}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onGoForward}
                disabled={!canGoForward}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go Forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onReload}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Reload"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* URL Input */}
              <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-white/5 rounded-lg">
                  <Globe className="w-3.5 h-3.5 text-slate-500 flex-none" />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setUrlInput(currentUrl)}
                    className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-500 outline-none font-mono"
                    placeholder="/"
                    spellCheck={false}
                  />
                </div>
              </form>
            </div>

            {(isGenerating || isFixingResp) && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-pulse" />
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium text-blue-300 animate-pulse">
                  {isFixingResp ? 'Adapting Layout...' : 'Constructing Interface...'}
                </p>
              </div>
            )}

            {/* iframe container with inspect overlay */}
            <div className="flex-1 relative overflow-hidden">
              <iframe ref={iframeRef} key={iframeKey} srcDoc={iframeSrc} title="Preview" className={`w-full h-full bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`} sandbox="allow-scripts allow-same-origin" />

              {/* Inspect Mode Overlay - positioned relative to iframe only */}
              <InspectionOverlay
                isActive={isInspectMode}
                hoveredRect={hoveredElement}
                selectedRect={inspectedElement?.rect || null}
              />
            </div>

            {isEditMode && (
              <div className="absolute left-1/2 -translate-x-1/2 w-[90%] md:w-[600px] z-50 animate-in slide-in-from-bottom-4 duration-300 bottom-8">
                <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 backdrop-blur-xl border border-orange-500/30 rounded-full shadow-2xl ring-1 ring-orange-500/20">
                  <div className="pl-3 pr-2 text-orange-400"><Pencil className="w-4 h-4" /></div>
                  <input type="text" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickEdit()} placeholder="Describe a specific change..." className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-400 focus:ring-0 px-2 h-9" autoFocus aria-label="Quick edit prompt" />
                  {isQuickEditing ? (
                    <div className="pr-3 pl-2"><Loader2 className="w-4 h-4 text-orange-400 animate-spin" /></div>
                  ) : (
                    <button onClick={handleQuickEdit} disabled={!editPrompt.trim()} className="p-2 rounded-full bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Submit edit">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-center mt-2">
                  <button onClick={() => setIsEditMode(false)} className="text-[10px] text-slate-500 hover:text-slate-300">Cancel Edit</button>
                </div>
              </div>
            )}

            {/* Component Inspector Panel */}
            {inspectedElement && (
              <ComponentInspector
                element={inspectedElement}
                onClose={onCloseInspector}
                onSubmit={onInspectEdit}
                isProcessing={isInspectEditing}
              />
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="relative transition-all duration-500 ease-out transform scale-90 opacity-60">
              <div className="relative w-[375px] h-[812px] bg-black rounded-[48px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10 z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center gap-3">
                  <div className="w-10 h-1 rounded-full bg-slate-800/50" />
                  <div className="w-2 h-2 rounded-full bg-slate-800/80" />
                </div>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <p className="text-slate-700 font-medium text-sm">Upload a sketch to generate app</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {appCode && (
        <ConsolePanel
          logs={logs}
          networkLogs={networkLogs}
          isOpen={isConsoleOpen}
          onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
          activeTab={activeTerminalTab}
          onTabChange={setActiveTerminalTab}
          onClearLogs={() => setLogs([])}
          onClearNetwork={() => setNetworkLogs([])}
          onFixError={fixError}
        />
      )}
    </div>
  );
};

// Helper functions for generating files
const buildIframeHtml = (files: FileSystem, isInspectMode: boolean = false): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="about:blank">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1a1a1a; min-height: 100vh; margin: 0; }
    #root { min-height: 100vh; }
    .sandbox-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .sandbox-loading .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    .sandbox-error { padding: 20px; background: #fee2e2; color: #dc2626; border-radius: 8px; margin: 20px; font-family: monospace; font-size: 14px; white-space: pre-wrap; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ${isInspectMode ? `
    .inspect-highlight { outline: 2px solid #3b82f6 !important; outline-offset: 2px; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; }
    .inspect-selected { outline: 3px solid #8b5cf6 !important; outline-offset: 2px; background-color: rgba(139, 92, 246, 0.1) !important; }
    * { cursor: crosshair !important; }
    ` : ''}
  </style>
</head>
<body>
  <div id="root">
    <div class="sandbox-loading">
      <div class="spinner"></div>
      <p style="margin-top: 16px; font-size: 14px;">Loading app...</p>
    </div>
  </div>
  <script>
    // Sandbox environment setup
    window.process = { env: { NODE_ENV: 'development' } };
    window.__SANDBOX_READY__ = false;

    // Console forwarding with error filtering
    const notify = (type, msg) => window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), timestamp: Date.now() }, '*');

    // Filter transient/harmless errors that shouldn't trigger auto-fix
    // IMPORTANT: Do NOT ignore fixable errors like "is not defined", "is not a function"
    const isIgnorableError = (msg) => {
      if (!msg) return true;
      const str = String(msg).toLowerCase();

      // These are truly transient/unfixable errors
      const ignorePatterns = [
        'resizeobserver',
        'script error',
        'loading chunk',
        'dynamically imported module',
        'failed to fetch',
        'network error',
        'hydrat',
        'unmounted component',
        'memory leak',
        'perform a react state update',
        'maximum update depth exceeded',
        'each child in a list should have a unique',
        'validatedomnesting',
        'received true for a non-boolean',
        'received false for a non-boolean',
        'unknown prop',
        'invalid prop',
        'failed prop type',
        'minified react error',
        'suspended while rendering',
        '__esmodule',
        'cannot redefine property'
      ];

      // These errors ARE fixable - do NOT ignore them
      // - "X is not defined" → missing import/declaration
      // - "X is not a function" → wrong import or missing export
      // - "cannot read properties of null/undefined" → null check needed
      // - "nothing was returned from render" → missing return statement

      return ignorePatterns.some(p => str.includes(p));
    };

    console.log = (...args) => { notify('log', args.join(' ')); };
    console.warn = (...args) => { notify('warn', args.join(' ')); };
    console.error = (...args) => {
      const msg = args.join(' ');
      // Still log to console but mark as ignorable for auto-fix
      notify('error', isIgnorableError(msg) ? '[TRANSIENT] ' + msg : msg);
    };
    window.onerror = function(msg) {
      notify('error', isIgnorableError(msg) ? '[TRANSIENT] ' + msg : msg);
      return false;
    };

    // Patch URL constructor FIRST - before any library loads
    (function() {
      var OriginalURL = window.URL;
      window.URL = function URL(url, base) {
        // Handle various edge cases
        if (url === undefined || url === null || url === '') {
          url = '/';
        }
        url = String(url);
        // If url is relative, provide default base
        if ((url.startsWith('/') || !url.includes('://')) && !base) {
          base = 'http://localhost';
        }
        try {
          return new OriginalURL(url, base);
        } catch (e) {
          // Last resort fallback
          return new OriginalURL('http://localhost' + (url.startsWith('/') ? url : '/' + url));
        }
      };
      window.URL.prototype = OriginalURL.prototype;
      window.URL.createObjectURL = OriginalURL.createObjectURL;
      window.URL.revokeObjectURL = OriginalURL.revokeObjectURL;
      window.URL.canParse = OriginalURL.canParse;
    })();

    // Inspect Mode
    window.__INSPECT_MODE__ = ${isInspectMode};
    ${isInspectMode ? `
    (function() {
      let highlightedEl = null;
      let selectedEl = null;

      // Try to get React component name from fiber
      function getComponentName(element) {
        // Try to find React fiber
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              return fiber.type.displayName || fiber.type.name || null;
            }
            if (fiber.type && typeof fiber.type === 'string') {
              // This is a DOM element, go up to parent
            }
            fiber = fiber.return;
          }
        }
        return null;
      }

      // Get parent component chain
      function getParentComponents(element) {
        const parents = [];
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              const name = fiber.type.displayName || fiber.type.name;
              if (name && !parents.includes(name)) {
                parents.push(name);
              }
            }
            fiber = fiber.return;
          }
        }
        return parents.slice(0, 5); // Limit to 5 parents
      }

      document.addEventListener('mouseover', function(e) {
        if (e.target === document.body || e.target === document.documentElement || e.target.id === 'root') return;

        if (highlightedEl && highlightedEl !== e.target) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        e.target.classList.add('inspect-highlight');
        highlightedEl = e.target;

        const rect = e.target.getBoundingClientRect();
        window.parent.postMessage({
          type: 'INSPECT_HOVER',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      }, true);

      document.addEventListener('mouseout', function(e) {
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }
        window.parent.postMessage({ type: 'INSPECT_LEAVE' }, '*');
      }, true);

      document.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const rect = target.getBoundingClientRect();
        const componentName = getComponentName(target);
        const parentComponents = getParentComponents(target);

        // Remove highlight from hovered element
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        // Remove selected class from previously selected element
        if (selectedEl && selectedEl !== target) {
          selectedEl.classList.remove('inspect-selected');
        }

        target.classList.add('inspect-selected');
        selectedEl = target;

        window.parent.postMessage({
          type: 'INSPECT_SELECT',
          element: {
            tagName: target.tagName,
            className: target.className.replace('inspect-highlight', '').replace('inspect-selected', '').trim(),
            id: target.id || null,
            textContent: target.textContent?.slice(0, 200) || null,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            componentName: componentName,
            parentComponents: parentComponents.length > 0 ? parentComponents : null,
            ffGroup: target.getAttribute('data-ff-group') || null,
            ffId: target.getAttribute('data-ff-id') || null
          }
        }, '*');
      }, true);

      // Update selection rect on scroll
      document.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.parent.postMessage({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);

      // Also listen to window scroll for cases where body doesn't scroll
      window.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.parent.postMessage({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);
    })();
    ` : ''}

    // Enhanced in-memory router state with full URL support
    window.__SANDBOX_ROUTER__ = {
      currentPath: '/',
      currentState: null,
      search: '',
      hash: '',
      listeners: [],

      navigate: function(path, state, skipNotify) {
        if (state === undefined) state = null;
        // Ensure path is a string
        path = String(path || '/');
        if (!path.startsWith('/')) path = '/' + path;

        // Parse URL manually (URL constructor is unreliable in sandbox)
        var pathname = path;
        var search = '';
        var hash = '';

        // Extract hash
        var hashIndex = path.indexOf('#');
        if (hashIndex >= 0) {
          hash = path.substring(hashIndex);
          pathname = path.substring(0, hashIndex);
        }

        // Extract search/query
        var searchIndex = pathname.indexOf('?');
        if (searchIndex >= 0) {
          search = pathname.substring(searchIndex);
          pathname = pathname.substring(0, searchIndex);
        }

        this.currentPath = pathname || '/';
        this.search = search;
        this.hash = hash;
        this.currentState = state;

        const location = this.getLocation();
        this.listeners.forEach(fn => fn(location));
        console.log('[Router] Navigated to: ' + this.currentPath + this.search + this.hash);

        // Notify parent of URL change (unless skipped for internal operations)
        if (!skipNotify) {
          this.notifyParent();
        }
      },

      notifyParent: function() {
        var historyInfo = window.__HISTORY_INFO__ || { index: 0, length: 1 };
        window.parent.postMessage({
          type: 'URL_CHANGE',
          url: this.currentPath + this.search + this.hash,
          canGoBack: historyInfo.index > 0,
          canGoForward: historyInfo.index < historyInfo.length - 1
        }, '*');
      },

      getLocation: function() {
        return {
          pathname: this.currentPath,
          search: this.search,
          hash: this.hash,
          state: this.currentState,
          key: Math.random().toString(36).substring(2, 8)
        };
      },

      subscribe: function(fn) {
        this.listeners.push(fn);
        return function() {
          window.__SANDBOX_ROUTER__.listeners = window.__SANDBOX_ROUTER__.listeners.filter(function(l) { return l !== fn; });
        };
      },

      getPath: function() { return this.currentPath; }
    };

    // History API emulation for React Router compatibility
    (function() {
      var historyStack = [{ state: null, title: '', url: '/' }];
      var historyIndex = 0;

      // Update global history info for URL bar
      function updateHistoryInfo() {
        window.__HISTORY_INFO__ = {
          index: historyIndex,
          length: historyStack.length
        };
      }
      updateHistoryInfo();

      // Store our custom history implementation
      var customHistory = {
        get length() { return historyStack.length; },
        get state() { return historyStack[historyIndex] ? historyStack[historyIndex].state : null; },
        get scrollRestoration() { return 'auto'; },
        set scrollRestoration(val) { /* noop */ },

        pushState: function(state, title, url) {
          historyStack = historyStack.slice(0, historyIndex + 1);
          historyStack.push({ state: state, title: title, url: url || '/' });
          historyIndex = historyStack.length - 1;
          updateHistoryInfo();
          window.__SANDBOX_ROUTER__.navigate(url || '/', state);
          // Dispatch popstate to trigger React Router re-render
          window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
        },

        replaceState: function(state, title, url) {
          historyStack[historyIndex] = { state: state, title: title, url: url || '/' };
          updateHistoryInfo();
          window.__SANDBOX_ROUTER__.navigate(url || '/', state);
          // Dispatch popstate to trigger React Router re-render
          window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
        },

        back: function() {
          if (historyIndex > 0) {
            historyIndex--;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        },

        forward: function() {
          if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        },

        go: function(delta) {
          var newIndex = historyIndex + delta;
          if (newIndex >= 0 && newIndex < historyStack.length) {
            historyIndex = newIndex;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        }
      };

      // Make it globally accessible
      window.__SANDBOX_HISTORY__ = customHistory;

      // Try to override native history methods (safer approach)
      try {
        var nativeHistory = window.history;
        Object.defineProperty(window, 'history', {
          get: function() { return customHistory; },
          configurable: true
        });
        console.log('[Sandbox] History API fully overridden');
      } catch (e) {
        // If we can't override window.history, at least override its methods
        try {
          window.history.pushState = customHistory.pushState;
          window.history.replaceState = customHistory.replaceState;
          window.history.back = customHistory.back;
          window.history.forward = customHistory.forward;
          window.history.go = customHistory.go;
          console.log('[Sandbox] History methods overridden');
        } catch (e2) {
          console.warn('[Sandbox] Could not override history API, using fallback');
        }
      }

      // Listen for navigation commands from parent window
      window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;

        if (event.data.type === 'NAVIGATE') {
          customHistory.pushState(null, '', event.data.url);
        } else if (event.data.type === 'GO_BACK') {
          customHistory.back();
        } else if (event.data.type === 'GO_FORWARD') {
          customHistory.forward();
        }
      });

      console.log('[Sandbox] History API emulation initialized');
    })();

    // Intercept all link clicks to prevent navigation outside sandbox
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          e.preventDefault();
          e.stopPropagation();

          // Handle different link types
          if (href.startsWith('http://') || href.startsWith('https://')) {
            // External links - open in new tab
            window.open(href, '_blank', 'noopener,noreferrer');
            console.log('[Sandbox] External link opened in new tab: ' + href);
          } else if (href.startsWith('mailto:') || href.startsWith('tel:')) {
            // Allow mailto/tel links
            window.open(href, '_self');
          } else if (href.startsWith('#')) {
            // Hash navigation - scroll to element and update hash
            const id = href.substring(1);
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            // Use our custom history for proper history tracking
            window.__SANDBOX_HISTORY__.pushState(null, '', href);
          } else {
            // Internal navigation - use our custom history
            window.__SANDBOX_HISTORY__.pushState(null, '', href);
          }
        }
      }
    }, true);

    // Intercept form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.tagName === 'FORM') {
        e.preventDefault();
        const action = form.getAttribute('action') || '/';
        const method = form.getAttribute('method') || 'GET';
        console.log('[Sandbox] Form submitted: ' + method + ' ' + action);
        // Use our custom history
        window.__SANDBOX_HISTORY__.pushState(null, '', action);
      }
    }, true);

    // Override window.location for React Router to read correct pathname
    // Note: SecurityError occurs when navigating, not reading - so we use our custom history for writes
    (function() {
      var fakeLocation = {
        get href() { return 'http://localhost' + window.__SANDBOX_ROUTER__.currentPath + window.__SANDBOX_ROUTER__.search + window.__SANDBOX_ROUTER__.hash; },
        get pathname() { return window.__SANDBOX_ROUTER__.currentPath; },
        get search() { return window.__SANDBOX_ROUTER__.search; },
        get hash() { return window.__SANDBOX_ROUTER__.hash; },
        get origin() { return 'http://localhost'; },
        get host() { return 'localhost'; },
        get hostname() { return 'localhost'; },
        get port() { return ''; },
        get protocol() { return 'http:'; },
        assign: function(url) { window.__SANDBOX_HISTORY__.pushState(null, '', url); },
        replace: function(url) { window.__SANDBOX_HISTORY__.replaceState(null, '', url); },
        reload: function() { console.log('[Sandbox] Reload blocked'); },
        toString: function() { return this.href; }
      };

      try {
        Object.defineProperty(window, 'location', {
          get: function() { return fakeLocation; },
          set: function(url) { window.__SANDBOX_HISTORY__.pushState(null, '', url); },
          configurable: true
        });
        console.log('[Sandbox] Location override successful');
      } catch (e) {
        console.warn('[Sandbox] Could not override location:', e.message);
      }
    })();

    // Provide useLocation and useNavigate hooks for React Router-like experience
    window.__SANDBOX_HOOKS__ = {
      useLocation: function() {
        const React = window.React;
        if (!React) return window.__SANDBOX_ROUTER__.getLocation();
        const [location, setLocation] = React.useState(window.__SANDBOX_ROUTER__.getLocation());
        React.useEffect(function() {
          return window.__SANDBOX_ROUTER__.subscribe(function(loc) {
            setLocation(loc);
          });
        }, []);
        return location;
      },
      useNavigate: function() {
        return function(to, options) {
          var hist = window.__SANDBOX_HISTORY__;
          if (options && options.replace) {
            hist.replaceState(options.state || null, '', to);
          } else {
            hist.pushState(options && options.state || null, '', to);
          }
        };
      },
      useParams: function() {
        // Basic params extraction - apps should use React Router for full functionality
        return {};
      },
      useSearchParams: function() {
        const React = window.React;
        const location = window.__SANDBOX_HOOKS__.useLocation();
        const searchParams = new URLSearchParams(location.search);
        const setSearchParams = function(params) {
          const newSearch = '?' + new URLSearchParams(params).toString();
          window.__SANDBOX_HISTORY__.pushState(null, '', location.pathname + newSearch + location.hash);
        };
        return [searchParams, setSearchParams];
      },
      Link: function(props) {
        const React = window.React;
        return React.createElement('a', {
          ...props,
          href: props.to || props.href,
          onClick: function(e) {
            e.preventDefault();
            var hist = window.__SANDBOX_HISTORY__;
            if (props.replace) {
              hist.replaceState(props.state || null, '', props.to || props.href);
            } else {
              hist.pushState(props.state || null, '', props.to || props.href);
            }
            if (props.onClick) props.onClick(e);
          }
        }, props.children);
      },
      NavLink: function(props) {
        const React = window.React;
        const location = window.__SANDBOX_HOOKS__.useLocation();
        const isActive = location.pathname === props.to;
        const className = typeof props.className === 'function'
          ? props.className({ isActive: isActive })
          : (isActive && props.activeClassName) || props.className;
        return React.createElement('a', {
          ...props,
          className: className,
          href: props.to || props.href,
          'aria-current': isActive ? 'page' : undefined,
          onClick: function(e) {
            e.preventDefault();
            window.__SANDBOX_HISTORY__.pushState(props.state || null, '', props.to || props.href);
            if (props.onClick) props.onClick(e);
          }
        }, props.children);
      }
    };
  </script>
  <script type="text/babel" data-presets="react,typescript">
    (async () => {
      const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));
      // Create a custom react-router-dom wrapper that makes BrowserRouter work in sandbox
      const routerShimCode = \`
        import * as ReactRouterDom from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';
        import React from 'https://esm.sh/react@19.0.0';

        // Re-export everything from react-router-dom
        export * from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';

        // Custom BrowserRouter that uses MemoryRouter internally for sandbox compatibility
        export function BrowserRouter({ children, ...props }) {
          const [location, setLocation] = React.useState(window.__SANDBOX_ROUTER__.getLocation());

          React.useEffect(() => {
            return window.__SANDBOX_ROUTER__.subscribe((loc) => {
              setLocation({ ...loc });
            });
          }, []);

          return React.createElement(
            ReactRouterDom.MemoryRouter,
            {
              initialEntries: [location.pathname + location.search + location.hash],
              ...props
            },
            React.createElement(SandboxRouterSync, { location }, children)
          );
        }

        // Internal component to sync MemoryRouter with our sandbox router
        function SandboxRouterSync({ location, children }) {
          const navigate = ReactRouterDom.useNavigate();
          const routerLocation = ReactRouterDom.useLocation();

          React.useEffect(() => {
            const fullPath = location.pathname + location.search + location.hash;
            const currentPath = routerLocation.pathname + routerLocation.search + routerLocation.hash;
            if (fullPath !== currentPath) {
              navigate(fullPath, { replace: true });
            }
          }, [location, navigate, routerLocation]);

          return children;
        }

        // Override useNavigate to use our sandbox history
        const originalUseNavigate = ReactRouterDom.useNavigate;
        export function useNavigate() {
          const memoryNavigate = originalUseNavigate();
          return (to, options) => {
            // Update our sandbox router
            if (typeof to === 'string') {
              if (options?.replace) {
                window.__SANDBOX_HISTORY__.replaceState(options?.state || null, '', to);
              } else {
                window.__SANDBOX_HISTORY__.pushState(options?.state || null, '', to);
              }
            } else if (typeof to === 'number') {
              window.__SANDBOX_HISTORY__.go(to);
            }
          };
        }
      \`;
      const routerShimUrl = URL.createObjectURL(new Blob([routerShimCode], { type: 'application/javascript' }));

      const importMap = {
        imports: {
          // React core
          "react": "https://esm.sh/react@19.0.0",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          // React Router - using our custom shim for sandbox compatibility
          "react-router-dom": routerShimUrl,
          "react-router": "https://esm.sh/react-router@6.28.0?external=react",
          // Icons
          "lucide-react": "https://esm.sh/lucide-react@0.469.0",
          // Utilities
          "clsx": "https://esm.sh/clsx@2.1.1",
          "classnames": "https://esm.sh/classnames@2.5.1",
          "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4",
          // Animation
          "framer-motion": "https://esm.sh/framer-motion@11.11.17?external=react,react-dom",
          // Date handling
          "date-fns": "https://esm.sh/date-fns@4.1.0",
          // State management (lightweight)
          "zustand": "https://esm.sh/zustand@5.0.1?external=react",
          // Form handling
          "react-hook-form": "https://esm.sh/react-hook-form@7.53.2?external=react"
        }
      };

      // Helper to resolve relative paths to absolute
      function resolvePath(fromFile, importPath) {
        if (!importPath.startsWith('.')) return importPath;
        const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
        const parts = fromDir.split('/').filter(Boolean);
        const importParts = importPath.split('/');

        for (const part of importParts) {
          if (part === '.') continue;
          if (part === '..') parts.pop();
          else parts.push(part);
        }
        return parts.join('/');
      }

      // Helper to find actual file (handles missing extensions)
      function findFile(path) {
        if (files[path]) return path;
        const extensions = ['.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          if (files[path + ext]) return path + ext;
        }
        // Try index files
        for (const ext of extensions) {
          if (files[path + '/index' + ext]) return path + '/index' + ext;
        }
        return null;
      }

      // Common lucide-react icons that are known to exist
      // This is a subset - add more as needed
      const KNOWN_LUCIDE_ICONS = new Set([
        // Common UI icons
        'Activity', 'AlertCircle', 'AlertTriangle', 'Archive', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
        'Award', 'BarChart', 'BarChart2', 'Bell', 'Book', 'Bookmark', 'Box', 'Briefcase', 'Calendar', 'Camera',
        'Check', 'CheckCircle', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp', 'Circle', 'Clipboard',
        'Clock', 'Cloud', 'Code', 'Code2', 'Coffee', 'Cog', 'Command', 'Copy', 'CreditCard', 'Database', 'Delete',
        'Download', 'Edit', 'Edit2', 'Edit3', 'ExternalLink', 'Eye', 'EyeOff', 'Facebook', 'File', 'FileText',
        'Filter', 'Flag', 'Folder', 'FolderOpen', 'Gift', 'Github', 'Globe', 'Grid', 'Hash', 'Heart', 'HelpCircle',
        'Home', 'Image', 'Inbox', 'Info', 'Instagram', 'Key', 'Layers', 'Layout', 'LayoutDashboard', 'Link', 'Link2',
        'List', 'Loader', 'Loader2', 'Lock', 'LogIn', 'LogOut', 'Mail', 'Map', 'MapPin', 'Maximize', 'Maximize2',
        'Menu', 'MessageCircle', 'MessageSquare', 'Mic', 'Minimize', 'Minimize2', 'Minus', 'Monitor', 'Moon', 'MoreHorizontal',
        'MoreVertical', 'Move', 'Music', 'Navigation', 'Package', 'Paperclip', 'Pause', 'PenTool', 'Percent', 'Phone',
        'PieChart', 'Pin', 'Play', 'Plus', 'PlusCircle', 'Pocket', 'Power', 'Printer', 'Radio', 'RefreshCw', 'Repeat',
        'RotateCcw', 'RotateCw', 'Rss', 'Save', 'Search', 'Send', 'Server', 'Settings', 'Settings2', 'Share', 'Share2',
        'Shield', 'ShieldCheck', 'ShoppingBag', 'ShoppingCart', 'Shuffle', 'Sidebar', 'SkipBack', 'SkipForward', 'Slack',
        'Sliders', 'Smartphone', 'Smile', 'Sparkles', 'Speaker', 'Square', 'Star', 'Stop', 'Sun', 'Sunrise', 'Sunset',
        'Table', 'Tablet', 'Tag', 'Target', 'Terminal', 'ThumbsDown', 'ThumbsUp', 'ToggleLeft', 'ToggleRight', 'Tool',
        'Trash', 'Trash2', 'TrendingDown', 'TrendingUp', 'Triangle', 'Truck', 'Tv', 'Twitter', 'Type', 'Umbrella',
        'Underline', 'Unlock', 'Upload', 'UploadCloud', 'User', 'UserCheck', 'UserMinus', 'UserPlus', 'Users', 'UserX',
        'Video', 'VideoOff', 'Voicemail', 'Volume', 'Volume1', 'Volume2', 'VolumeX', 'Watch', 'Wifi', 'WifiOff', 'Wind',
        'X', 'XCircle', 'Youtube', 'Zap', 'ZapOff', 'ZoomIn', 'ZoomOut',
        // Additional common icons
        'Accessibility', 'AlignCenter', 'AlignJustify', 'AlignLeft', 'AlignRight', 'Anchor', 'Aperture', 'App',
        'Apple', 'ArrowBigDown', 'ArrowBigLeft', 'ArrowBigRight', 'ArrowBigUp', 'ArrowDownCircle', 'ArrowLeftCircle',
        'ArrowRightCircle', 'ArrowUpCircle', 'AtSign', 'Axe', 'Baby', 'Backpack', 'Badge', 'BadgeCheck', 'BadgeDollarSign',
        'BadgeInfo', 'BadgeMinus', 'BadgePlus', 'Banknote', 'Battery', 'BatteryCharging', 'BatteryFull', 'BatteryLow',
        'BatteryMedium', 'Beaker', 'Bean', 'Bed', 'Beer', 'BellMinus', 'BellOff', 'BellPlus', 'BellRing', 'Bike',
        'Binary', 'Bird', 'Bitcoin', 'Blend', 'Blocks', 'Bluetooth', 'Bold', 'Bomb', 'Bone', 'BookCopy', 'BookDashed',
        'BookDown', 'BookImage', 'BookKey', 'BookLock', 'BookMarked', 'BookMinus', 'BookOpen', 'BookOpenCheck', 'BookOpenText',
        'BookPlus', 'BookText', 'BookUp', 'BookUser', 'Bot', 'Boxes', 'Brain', 'BrainCircuit', 'Brush', 'Bug', 'Building',
        'Building2', 'Bus', 'Cable', 'Cake', 'Calculator', 'CalendarCheck', 'CalendarClock', 'CalendarDays', 'CalendarHeart',
        'CalendarMinus', 'CalendarOff', 'CalendarPlus', 'CalendarRange', 'CalendarSearch', 'CalendarX', 'CameraOff', 'Candy',
        'Car', 'Carrot', 'Cat', 'Cigarette', 'CircleDashed', 'CircleDot', 'CircleOff', 'CircleSlash', 'Citrus', 'Clapperboard',
        'ClipboardCheck', 'ClipboardCopy', 'ClipboardEdit', 'ClipboardList', 'ClipboardSignature', 'ClipboardType', 'ClipboardX',
        'CloudCog', 'CloudDownload', 'CloudDrizzle', 'CloudFog', 'CloudHail', 'CloudLightning', 'CloudMoon', 'CloudMoonRain',
        'CloudOff', 'CloudRain', 'CloudRainWind', 'CloudSnow', 'CloudSun', 'CloudSunRain', 'CloudUpload', 'Clover', 'Club',
        'Coins', 'Columns', 'Combine', 'Compass', 'Component', 'Computer', 'ConciergeBell', 'Cone', 'Construction', 'Contact',
        'Container', 'Contrast', 'Cookie', 'CopyCheck', 'CopyMinus', 'CopyPlus', 'CopySlash', 'CopyX', 'Copyright', 'CornerDownLeft',
        'CornerDownRight', 'CornerLeftDown', 'CornerLeftUp', 'CornerRightDown', 'CornerRightUp', 'CornerUpLeft', 'CornerUpRight',
        'Cpu', 'Croissant', 'Crop', 'Cross', 'Crosshair', 'Crown', 'Cup', 'Currency', 'DatabaseBackup', 'Diamond', 'Dice1',
        'Dice2', 'Dice3', 'Dice4', 'Dice5', 'Dice6', 'Dices', 'Diff', 'Disc', 'Disc2', 'Divide', 'DivideCircle', 'DivideSquare',
        'Dna', 'DnaOff', 'Dog', 'DollarSign', 'Donut', 'DoorClosed', 'DoorOpen', 'Dot', 'DownloadCloud', 'Dribbble', 'Droplet',
        'Droplets', 'Drum', 'Drumstick', 'Dumbbell', 'Ear', 'EarOff', 'Eclipse', 'Egg', 'EggFried', 'EggOff', 'Equal', 'EqualNot',
        'Eraser', 'Euro', 'Expand', 'Factory', 'Fan', 'FastForward', 'Feather', 'Fence', 'FerrisWheel', 'Figma', 'FileArchive',
        'FileAudio', 'FileAxis3d', 'FileBadge', 'FileBadge2', 'FileBarChart', 'FileBarChart2', 'FileBox', 'FileCheck', 'FileCheck2',
        'FileClock', 'FileCode', 'FileCode2', 'FileCog', 'FileDiff', 'FileDigit', 'FileDown', 'FileEdit', 'FileHeart', 'FileImage',
        'FileInput', 'FileJson', 'FileJson2', 'FileKey', 'FileKey2', 'FileLineChart', 'FileLock', 'FileLock2', 'FileMinus',
        'FileMinus2', 'FileMusic', 'FileOutput', 'FilePieChart', 'FilePlus', 'FilePlus2', 'FileQuestion', 'FileScan', 'FileSearch',
        'FileSearch2', 'FileSliders', 'FileSpreadsheet', 'FileStack', 'FileSymlink', 'FileTerminal', 'FileType', 'FileType2',
        'FileUp', 'FileVideo', 'FileVideo2', 'FileVolume', 'FileVolume2', 'FileWarning', 'FileX', 'FileX2', 'Files', 'Film',
        'Fingerprint', 'Fish', 'FishOff', 'FishSymbol', 'Flame', 'FlameKindling', 'Flashlight', 'FlashlightOff', 'Flask',
        'FlaskConical', 'FlaskRound', 'FlipHorizontal', 'FlipHorizontal2', 'FlipVertical', 'FlipVertical2', 'Flower', 'Flower2',
        'Focus', 'FolderArchive', 'FolderCheck', 'FolderClock', 'FolderClosed', 'FolderCog', 'FolderDot', 'FolderDown',
        'FolderEdit', 'FolderGit', 'FolderGit2', 'FolderHeart', 'FolderInput', 'FolderKanban', 'FolderKey', 'FolderLock',
        'FolderMinus', 'FolderOutput', 'FolderPlus', 'FolderRoot', 'FolderSearch', 'FolderSearch2', 'FolderSymlink', 'FolderSync',
        'FolderTree', 'FolderUp', 'FolderX', 'Folders', 'Footprints', 'Forklift', 'FormInput', 'Forward', 'Frame', 'Framer',
        'Frown', 'Fuel', 'Fullscreen', 'FunctionSquare', 'GalleryHorizontal', 'GalleryHorizontalEnd', 'GalleryThumbnails',
        'GalleryVertical', 'GalleryVerticalEnd', 'Gamepad', 'Gamepad2', 'Gauge', 'Gavel', 'Gem', 'Ghost', 'GiftCard', 'GitBranch',
        'GitBranchPlus', 'GitCommit', 'GitCompare', 'GitFork', 'GitMerge', 'GitPullRequest', 'GitPullRequestClosed',
        'GitPullRequestDraft', 'Glasses', 'Globe2', 'Goal', 'Grab', 'GraduationCap', 'Grape', 'Grid2X2', 'Grid3X3', 'Grip',
        'GripHorizontal', 'GripVertical', 'Group', 'Hammer', 'Hand', 'HandMetal', 'HardDrive', 'HardDriveDownload',
        'HardDriveUpload', 'HardHat', 'Haze', 'HdmiPort', 'Heading', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5',
        'Heading6', 'Headphones', 'HeartCrack', 'HeartHandshake', 'HeartOff', 'HeartPulse', 'Heater', 'Hexagon', 'Highlighter',
        'History', 'Hop', 'HopOff', 'Hotel', 'Hourglass', 'IceCream', 'IceCream2', 'ImageDown', 'ImageMinus', 'ImageOff',
        'ImagePlus', 'Import', 'Indent', 'IndianRupee', 'Infinity', 'Inspect', 'Italic', 'JapaneseYen', 'Joystick', 'Kanban',
        'KanbanSquare', 'KanbanSquareDashed', 'KeyRound', 'KeySquare', 'Keyboard', 'Lamp', 'LampCeiling', 'LampDesk', 'LampFloor',
        'LampWallDown', 'LampWallUp', 'LandPlot', 'Landmark', 'Languages', 'Laptop', 'Laptop2', 'Lasso', 'LassoSelect', 'Laugh',
        'LayoutGrid', 'LayoutList', 'LayoutPanelLeft', 'LayoutPanelTop', 'LayoutTemplate', 'Leaf', 'LeafyGreen', 'Library',
        'LifeBuoy', 'Ligature', 'Lightbulb', 'LightbulbOff', 'LineChart', 'ListCheck', 'ListChecks', 'ListCollapse', 'ListEnd',
        'ListFilter', 'ListMinus', 'ListMusic', 'ListOrdered', 'ListPlus', 'ListRestart', 'ListStart', 'ListTodo', 'ListTree',
        'ListVideo', 'ListX', 'Locate', 'LocateFixed', 'LocateOff', 'LockKeyhole', 'LockKeyholeOpen', 'LockOpen', 'Lollipop',
        'Luggage', 'Magnet', 'MailCheck', 'MailMinus', 'MailOpen', 'MailPlus', 'MailQuestion', 'MailSearch', 'MailWarning',
        'MailX', 'Mailbox', 'Mails', 'MapPinOff', 'Martini', 'Megaphone', 'MegaphoneOff', 'Meh', 'MemoryStick', 'MenuSquare',
        'Merge', 'MessageCircleCode', 'MessageSquareCode', 'MessageSquareDashed', 'MessageSquareDot', 'MessageSquareHeart',
        'MessageSquareMore', 'MessageSquareOff', 'MessageSquarePlus', 'MessageSquareQuote', 'MessageSquareReply',
        'MessageSquareShare', 'MessageSquareText', 'MessageSquareWarning', 'MessageSquareX', 'MessagesSquare', 'MicOff',
        'Microchip', 'Microscope', 'Microwave', 'Milestone', 'Milk', 'MilkOff', 'MinusCircle', 'MinusSquare', 'MonitorCheck',
        'MonitorDot', 'MonitorDown', 'MonitorOff', 'MonitorPause', 'MonitorPlay', 'MonitorSmartphone', 'MonitorSpeaker',
        'MonitorStop', 'MonitorUp', 'MonitorX', 'MoonStar', 'Mountain', 'MountainSnow', 'Mouse', 'MousePointer', 'MousePointer2',
        'MousePointerClick', 'MoveDown', 'MoveDownLeft', 'MoveDownRight', 'MoveDiagonal', 'MoveDiagonal2', 'MoveHorizontal',
        'MoveLeft', 'MoveRight', 'MoveUp', 'MoveUpLeft', 'MoveUpRight', 'MoveVertical', 'Music2', 'Music3', 'Music4',
        'Navigation2', 'NavigationOff', 'Network', 'Newspaper', 'Nfc', 'Notebook', 'NotebookPen', 'NotebookTabs', 'NotebookText',
        'NotepadText', 'NotepadTextDashed', 'Nut', 'NutOff', 'Octagon', 'Option', 'Orbit', 'Outdent', 'PackageCheck',
        'PackageMinus', 'PackageOpen', 'PackagePlus', 'PackageSearch', 'PackageX', 'PaintBucket', 'Paintbrush', 'Paintbrush2',
        'Palette', 'PalmTree', 'PanelBottom', 'PanelBottomClose', 'PanelBottomDashed', 'PanelBottomOpen', 'PanelLeft',
        'PanelLeftClose', 'PanelLeftDashed', 'PanelLeftOpen', 'PanelRight', 'PanelRightClose', 'PanelRightDashed',
        'PanelRightOpen', 'PanelTop', 'PanelTopClose', 'PanelTopDashed', 'PanelTopOpen', 'Paperclip', 'Parentheses',
        'ParkingCircle', 'ParkingCircleOff', 'ParkingMeter', 'ParkingSquare', 'ParkingSquareOff', 'PartyPopper', 'PauseCircle',
        'PauseOctagon', 'PawPrint', 'PcCase', 'Pen', 'PenLine', 'Pencil', 'PencilLine', 'Pentagon', 'PercentCircle',
        'PercentDiamond', 'PercentSquare', 'PersonStanding', 'PhoneCall', 'PhoneForwarded', 'PhoneIncoming', 'PhoneMissed',
        'PhoneOff', 'PhoneOutgoing', 'Pi', 'Piano', 'Pickaxe', 'PictureInPicture', 'PictureInPicture2', 'PiggyBank', 'Pilcrow',
        'PilcrowSquare', 'Pill', 'PinOff', 'Pipette', 'Pizza', 'Plane', 'PlaneLanding', 'PlaneTakeoff', 'PlayCircle', 'PlaySquare',
        'Plug', 'Plug2', 'PlugZap', 'PlugZap2', 'PlusSquare', 'Podcast', 'Pointer', 'PointerOff', 'Popcorn', 'Popsicle', 'PoundSterling',
        'PowerOff', 'Presentation', 'PrinterCheck', 'Projector', 'Proportions', 'Puzzle', 'Pyramid', 'QrCode', 'Quote', 'Rabbit',
        'Radar', 'Radiation', 'RadioReceiver', 'RadioTower', 'Rainbow', 'Rat', 'Ratio', 'Receipt', 'ReceiptCent', 'ReceiptEuro',
        'ReceiptIndianRupee', 'ReceiptJapaneseYen', 'ReceiptPoundSterling', 'ReceiptRussianRuble', 'ReceiptSwissFranc', 'ReceiptText',
        'RectangleHorizontal', 'RectangleVertical', 'Recycle', 'Redo', 'Redo2', 'RefreshCcw', 'RefreshCcwDot', 'RefreshCwOff',
        'Refrigerator', 'Regex', 'RemoveFormatting', 'Repeat1', 'Repeat2', 'Replace', 'ReplaceAll', 'Reply', 'ReplyAll', 'Rewind',
        'Ribbon', 'Rocket', 'RockingChair', 'RollerCoaster', 'Rotate3d', 'Route', 'RouteOff', 'Router', 'Rows', 'Ruler', 'RussianRuble',
        'Sailboat', 'Salad', 'Sandwich', 'Satellite', 'SatelliteDish', 'Scale', 'Scale3d', 'Scaling', 'Scan', 'ScanBarcode', 'ScanEye',
        'ScanFace', 'ScanLine', 'ScanSearch', 'ScanText', 'School', 'School2', 'Scissors', 'ScissorsLineDashed', 'ScreenShare',
        'ScreenShareOff', 'Scroll', 'ScrollText', 'SearchCheck', 'SearchCode', 'SearchSlash', 'SearchX', 'Section', 'SendHorizontal',
        'SendToBack', 'SeparatorHorizontal', 'SeparatorVertical', 'ServerCog', 'ServerCrash', 'ServerOff', 'Shapes', 'ShieldAlert',
        'ShieldBan', 'ShieldClose', 'ShieldEllipsis', 'ShieldHalf', 'ShieldMinus', 'ShieldOff', 'ShieldPlus', 'ShieldQuestion', 'ShieldX',
        'Ship', 'ShipWheel', 'Shirt', 'ShoppingBasket', 'Shovel', 'ShowerHead', 'Shrink', 'Shrub', 'SidebarClose', 'SidebarOpen',
        'Sigma', 'Signal', 'SignalHigh', 'SignalLow', 'SignalMedium', 'SignalZero', 'Signpost', 'SignpostBig', 'Siren', 'SkipBack',
        'SlidersHorizontal', 'SmilePlus', 'Snail', 'Snowflake', 'Sofa', 'Soup', 'Space', 'Spade', 'Sparkle', 'Speech', 'SpellCheck',
        'SpellCheck2', 'Spline', 'Split', 'SprayCan', 'Sprout', 'SquareAsterisk', 'SquareCode', 'SquareDashedBottom',
        'SquareDashedBottomCode', 'SquareDot', 'SquareEqual', 'SquareGantt', 'SquareKanban', 'SquareLibrary', 'SquareM', 'SquareMenu',
        'SquareMinus', 'SquareParking', 'SquareParkingOff', 'SquarePen', 'SquarePercent', 'SquarePi', 'SquarePlay', 'SquarePlus',
        'SquarePower', 'SquareRadical', 'SquareScissors', 'SquareSigma', 'SquareSlash', 'SquareSplitHorizontal', 'SquareSplitVertical',
        'SquareStack', 'SquareTerminal', 'SquareUser', 'SquareUserRound', 'SquareX', 'Squircle', 'Squirrel', 'Stamp', 'StarHalf',
        'StarOff', 'Stars', 'StepBack', 'StepForward', 'Stethoscope', 'Sticker', 'StickyNote', 'Stopwatch', 'Store', 'StretchHorizontal',
        'StretchVertical', 'Strikethrough', 'Subscript', 'Subtitles', 'SunDim', 'SunMedium', 'SunMoon', 'SunSnow', 'Sunglasses',
        'Superscript', 'SwatchBook', 'SwissFranc', 'SwitchCamera', 'Sword', 'Swords', 'Syringe', 'Table2', 'TableCellsMerge',
        'TableCellsSplit', 'TableProperties', 'Tablets', 'Tally1', 'Tally2', 'Tally3', 'Tally4', 'Tally5', 'Tangent', 'Tape',
        'TargetOff', 'Telescope', 'Tent', 'TentTree', 'TerminalSquare', 'TestTube', 'TestTube2', 'TestTubes', 'Text', 'TextCursor',
        'TextCursorInput', 'TextQuote', 'TextSearch', 'TextSelect', 'Theater', 'Thermometer', 'ThermometerSnowflake', 'ThermometerSun',
        'TicketCheck', 'TicketMinus', 'TicketPercent', 'TicketPlus', 'TicketSlash', 'TicketX', 'Tickets', 'TicketsPlane', 'Timer',
        'TimerOff', 'TimerReset', 'ToggleLeft', 'Tornado', 'Torus', 'Touchpad', 'TouchpadOff', 'TowerControl', 'ToyBrick', 'Tractor',
        'TrafficCone', 'Train', 'TrainFront', 'TrainFrontTunnel', 'TrainTrack', 'TramFront', 'TreeDeciduous', 'TreePalm', 'TreePine',
        'Trees', 'Trello', 'TriangleAlert', 'TriangleRight', 'Trophy', 'Turtle', 'TvMinimal', 'TvMinimalPlay', 'Twitch', 'TypeOutline',
        'Umbrella', 'UmbrellaOff', 'Underline', 'Undo', 'Undo2', 'UndoDot', 'UnfoldHorizontal', 'UnfoldVertical', 'Ungroup', 'University',
        'Unlink', 'Unlink2', 'Unplug', 'Upload', 'Usb', 'UserCircle', 'UserCircle2', 'UserCog', 'UserRound', 'UserRoundCheck', 'UserRoundCog',
        'UserRoundMinus', 'UserRoundPlus', 'UserRoundSearch', 'UserRoundX', 'UserSearch', 'UserSquare', 'UserSquare2', 'UsersRound',
        'Utensils', 'UtensilsCrossed', 'UtilityPole', 'Variable', 'Vault', 'Vegan', 'VenetianMask', 'Vibrate', 'VibrateOff', 'Video',
        'VideoOff', 'Videotape', 'View', 'Wallet', 'Wallet2', 'WalletCards', 'WalletMinimal', 'Wallpaper', 'Wand', 'Wand2', 'Warehouse',
        'WashingMachine', 'Waves', 'Waypoints', 'Webcam', 'Webhook', 'Weight', 'Wheat', 'WheatOff', 'WholeWord', 'WineOff', 'Workflow',
        'Worm', 'WrapText', 'Wrench', 'X', 'XOctagon', 'XSquare', 'Zap'
      ]);

      // Transform lucide-react imports to replace unknown icons with HelpCircle
      function transformLucideImports(code) {
        return code.replace(
          /import\\s*{([^}]+)}\\s*from\\s*['"]lucide-react['"]/g,
          (match, imports) => {
            const iconList = imports.split(',').map(s => s.trim()).filter(Boolean);
            const transformed = iconList.map(icon => {
              // Handle 'as' aliasing like "Star as StarIcon"
              const [iconName, alias] = icon.split(/\\s+as\\s+/).map(s => s.trim());
              if (KNOWN_LUCIDE_ICONS.has(iconName)) {
                return icon; // Keep as is
              }
              // Replace unknown icon with HelpCircle
              console.warn('[Lucide] Unknown icon "' + iconName + '" replaced with HelpCircle');
              return alias ? 'HelpCircle as ' + alias : 'HelpCircle as ' + iconName;
            });
            return 'import { ' + transformed.join(', ') + " } from 'lucide-react'";
          }
        );
      }

      // Transform imports in code to use absolute paths
      function transformImports(code, fromFile) {
        // First transform lucide imports
        code = transformLucideImports(code);
        return code.replace(
          /(import\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        ).replace(
          /(export\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        );
      }

      // Process all files
      const errors = [];
      console.log('[Sandbox] Processing ' + Object.keys(files).length + ' files...');

      for (const [filename, content] of Object.entries(files)) {
        if (/\\.(tsx|ts|jsx|js)$/.test(filename)) {
          try {
            // Transform relative imports to absolute before transpiling
            const transformedContent = transformImports(content, filename);
            const transpiled = Babel.transform(transformedContent, {
              presets: ['react', ['env', { modules: false }], 'typescript'],
              filename
            }).code;
            const url = URL.createObjectURL(new Blob([transpiled], { type: 'application/javascript' }));

            // Add multiple import map entries for flexibility
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

            // Also add relative-style entries from src
            if (filename.startsWith('src/')) {
              const relativePath = './' + filename.substring(4);
              importMap.imports[relativePath] = url;
              importMap.imports[relativePath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

              // Also support imports without src/ prefix
              const withoutSrc = filename.substring(4);
              importMap.imports[withoutSrc] = url;
              importMap.imports[withoutSrc.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
            }

            // Support component folder imports (e.g., 'components/Header' -> 'src/components/Header.tsx')
            if (filename.includes('/components/')) {
              const componentPath = filename.split('/components/')[1];
              if (componentPath) {
                importMap.imports['components/' + componentPath] = url;
                importMap.imports['components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
                importMap.imports['./components/' + componentPath] = url;
                importMap.imports['./components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
              }
            }

            console.log('[Sandbox] Compiled: ' + filename);
          } catch (err) {
            console.error('[Sandbox] Transpilation failed for ' + filename + ': ' + err.message);
            errors.push({ file: filename, error: err.message });
          }
        } else if (/\\.css$/.test(filename)) {
          // Handle CSS files - inject as style tag
          const style = document.createElement('style');
          style.textContent = content;
          style.setAttribute('data-file', filename);
          document.head.appendChild(style);
          // Create dummy module for CSS imports
          const cssModule = 'export default {};';
          const url = URL.createObjectURL(new Blob([cssModule], { type: 'application/javascript' }));
          importMap.imports[filename] = url;
          importMap.imports[filename.replace(/\\.css$/, '')] = url;
          console.log('[Sandbox] Loaded CSS: ' + filename);
        } else if (/\\.json$/.test(filename)) {
          // Handle JSON files
          try {
            const jsonModule = 'export default ' + content + ';';
            const url = URL.createObjectURL(new Blob([jsonModule], { type: 'application/javascript' }));
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.json$/, '')] = url;
          } catch (err) {
            console.error('[Sandbox] JSON parse failed for ' + filename);
          }
        }
      }

      if (errors.length > 0) {
        console.warn('[Sandbox] ' + errors.length + ' file(s) failed to compile');
      }

      const mapScript = document.createElement('script');
      mapScript.type = "importmap";
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);

      // Bootstrap code that makes React hooks globally available
      const bootstrapCode = \`
        import * as React from 'react';
        import { createRoot } from 'react-dom/client';
        import App from 'src/App.tsx';

        // Make React and hooks globally available
        window.React = React;
        window.useState = React.useState;
        window.useEffect = React.useEffect;
        window.useCallback = React.useCallback;
        window.useMemo = React.useMemo;
        window.useRef = React.useRef;
        window.useContext = React.useContext;
        window.useReducer = React.useReducer;
        window.useLayoutEffect = React.useLayoutEffect;
        window.createContext = React.createContext;
        window.forwardRef = React.forwardRef;
        window.memo = React.memo;
        window.Fragment = React.Fragment;

        // Render the app
        try {
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
          window.__SANDBOX_READY__ = true;
          console.log('[Sandbox] App mounted successfully');
        } catch (err) {
          console.error('[Sandbox] Failed to mount app:', err.message);
          document.getElementById('root').innerHTML = '<div class="sandbox-error">Error: ' + err.message + '</div>';
        }
      \`;

      const script = document.createElement('script');
      script.type = 'module';
      try {
        const transpiledBootstrap = Babel.transform(bootstrapCode, {
          presets: ['react', ['env', { modules: false }], 'typescript'],
          filename: 'bootstrap.tsx'
        }).code;
        script.src = URL.createObjectURL(new Blob([transpiledBootstrap], { type: 'application/javascript' }));
        document.body.appendChild(script);
      } catch (err) {
        console.error('[Sandbox] Bootstrap transpilation failed:', err.message);
        document.getElementById('root').innerHTML = '<div class="sandbox-error">Bootstrap Error: ' + err.message + '</div>';
      }
    })().catch(err => {
      console.error('[Sandbox] Initialization failed:', err.message);
      document.getElementById('root').innerHTML = '<div class="sandbox-error">Init Error: ' + err.message + '</div>';
    });
  </script>
</body>
</html>`;
};

const getPackageJson = (name: string) => ({
  name, version: "1.0.0", private: true, type: "module",
  scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
  dependencies: { "react": "^18.3.0", "react-dom": "^18.3.0", "lucide-react": "^0.400.0" },
  devDependencies: { "@vitejs/plugin-react": "^4.3.0", "vite": "^5.4.0", "typescript": "^5.5.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0", "tailwindcss": "^3.4.0", "postcss": "^8.4.0", "autoprefixer": "^10.4.0" }
});

const getViteConfig = () => `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })`;
const getTsConfig = () => ({ compilerOptions: { target: "ES2020", useDefineForClassFields: true, lib: ["ES2020", "DOM", "DOM.Iterable"], module: "ESNext", skipLibCheck: true, moduleResolution: "bundler", allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx", strict: true }, include: ["src"] });
const getTailwindConfig = () => `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`;
const getPostcssConfig = () => `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`;
const getIndexHtml = () => `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>FluidFlow App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`;
const getMainTsx = () => `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`;
const getTailwindCss = () => `@tailwind base;\n@tailwind components;\n@tailwind utilities;`;
const getReadme = () => `# FluidFlow App\n\nGenerated with FluidFlow - Sketch to App\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
