import React, { useEffect, useState, useRef, memo } from 'react';
import {
  Monitor, Smartphone, Tablet, RefreshCw, Eye, Code2, Copy, Check, Download, Database,
  ShieldCheck, FileText, Wrench, Package, Loader2,
  SplitSquareVertical, X, Zap, ZapOff, MousePointer2, Bug, Settings, ChevronDown,
  Play, Box, Bot, Map, GitBranch
} from 'lucide-react';
import { getProviderManager } from '../../services/ai';
import { buildIframeHtml } from '../../utils/sandboxHtml';
import { FileSystem, LogEntry, TabType, PreviewDevice } from '../../types';
import { cleanGeneratedCode } from '../../utils/cleanCode';
import { useTechStack } from '../../hooks/useTechStack';
import { useAutoFix } from '../../hooks/useAutoFix';
import { usePreviewAI } from '../../hooks/usePreviewAI';
import { useExport } from '../../hooks/useExport';

// Local hooks
import { useIframeMessaging, useInspectMode } from './hooks';

// Sub-components
import { CodeEditor } from './CodeEditor';
import { FileExplorer } from './FileExplorer';
import { ExportModal } from './ExportModal';
import { GithubModal } from './GithubModal';
import { AccessibilityModal } from './AccessibilityModal';
import { ConsultantReport } from './ConsultantReport';
import { InspectedElement, EditScope } from './ComponentInspector';
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
import { PreviewContent } from './PreviewContent';
import { CodeQualityPanel } from './CodeQualityPanel';
import { GitStatus, runnerApi } from '../../services/projectApi';

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
  // Auto-commit error tracking
  onPreviewErrorsChange?: (hasErrors: boolean) => void;
  // Undo/Revert support
  onUndo?: () => void;
  canUndo?: boolean;
  // Runner status callback
  onRunnerStatusChange?: (isRunning: boolean) => void;
}

export const PreviewPanel = memo(function PreviewPanel({
  files, setFiles, activeFile, setActiveFile, suggestions, setSuggestions, isGenerating, reviewChange, selectedModel,
  activeTab: externalActiveTab, setActiveTab: externalSetActiveTab, onInspectEdit, onSendErrorToChat,
  projectId, gitStatus, onInitGit, onCommit, onRefreshGitStatus,
  hasUncommittedChanges, localChanges, onDiscardChanges, onRevertToCommit,
  onPreviewErrorsChange,
  onUndo, canUndo,
  onRunnerStatusChange
}: PreviewPanelProps) {
  // State
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [key, setKey] = useState(0);
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>('preview');

  // Use external state if provided, otherwise use internal
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = externalSetActiveTab ?? setInternalActiveTab;
  const [isCopied, setIsCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  // Console logs state (shared between useAutoFix and useIframeMessaging)
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Track preview errors for auto-commit feature
  const prevHasErrorsRef = useRef<boolean>(false);
  useEffect(() => {
    // Check if there are any error logs (excluding fixed ones)
    const hasErrors = logs.some(log => log.type === 'error' && !log.isFixed);
    if (hasErrors !== prevHasErrorsRef.current) {
      prevHasErrorsRef.current = hasErrors;
      onPreviewErrorsChange?.(hasErrors);
    }
  }, [logs, onPreviewErrorsChange]);

  // Inspect editing state (shared between useIframeMessaging and useInspectMode)
  const [isInspectEditing, setIsInspectEditing] = useState(false);

  // Split View
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<string>('');

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Runner status for indicator
  const [isRunnerActive, setIsRunnerActive] = useState(false);

  // Notify parent when runner status changes
  useEffect(() => {
    onRunnerStatusChange?.(isRunnerActive);
  }, [isRunnerActive, onRunnerStatusChange]);

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

  // Check runner status periodically
  useEffect(() => {
    if (!projectId) {
      setIsRunnerActive(false);
      return;
    }

    let mounted = true;

    const checkStatus = async () => {
      try {
        const status = await runnerApi.status(projectId);
        if (mounted) {
          setIsRunnerActive(status.running || status.status === 'installing' || status.status === 'starting');
        }
      } catch {
        if (mounted) {
          setIsRunnerActive(false);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [projectId]);

  // App code reference
  const appCode = files['src/App.tsx'];

  // Tech Stack for AI context
  const { generateSystemInstruction } = useTechStack();

  // Auto-fix hook
  const {
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
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    handleSendErrorToChat,
    handleDismissFailedError,
    processError,
  } = useAutoFix({
    files,
    setFiles,
    appCode,
    selectedModel,
    isGenerating,
    logs,
    setLogs,
    onSendErrorToChat,
    generateSystemInstruction,
  });

  // Iframe messaging hook (console, network, inspect events, URL)
  const {
    networkLogs,
    setNetworkLogs,
    isConsoleOpen,
    setIsConsoleOpen,
    activeTerminalTab,
    setActiveTerminalTab,
    hoveredElement,
    inspectedElement,
    clearInspectedElement,
    currentUrl,
    canGoBack,
    canGoForward,
    navigateToUrl,
    goBack,
    goForward,
    iframeRef,
  } = useIframeMessaging({
    isInspectEditing,
    onProcessError: processError,
    logs,
    setLogs,
  });

  // Inspect mode hook
  const {
    isInspectMode,
    toggleInspectMode,
    exitInspectMode,
    handleInspectEdit: inspectModeHandleEdit,
  } = useInspectMode({
    files,
    appCode,
    selectedModel,
    reviewChange,
    onExternalInspectEdit: onInspectEdit,
    onClearInspectedElement: clearInspectedElement,
    isInspectEditing,
    setIsInspectEditing,
  });

  // Preview AI hook (accessibility, responsiveness, database)
  const {
    accessibilityReport,
    isAuditing,
    isFixingAccessibility,
    showAccessReport,
    setShowAccessReport,
    runAccessibilityAudit,
    fixAccessibilityIssues,
    isFixingResponsiveness,
    fixResponsiveness,
    isGeneratingDB,
  } = usePreviewAI({
    files,
    appCode,
    selectedModel,
    setFiles,
    reviewChange,
  });

  // Export hook
  const {
    showExportModal,
    setShowExportModal,
    isDownloading,
    downloadAsZip,
    showGithubModal,
    setShowGithubModal,
    githubToken,
    setGithubToken,
    repoName,
    setRepoName,
    isPushing,
    pushResult,
    setPushResult,
    pushToGithub,
  } = useExport({
    files,
    appCode,
  });

  // Build iframe content
  useEffect(() => {
    if (appCode) {
      const html = buildIframeHtml(files, isInspectMode);
      setIframeSrc(html);
    }
  }, [appCode, files, isInspectMode]);

  // Handle inspect mode toggle with iframe refresh
  const handleToggleInspectMode = () => {
    toggleInspectMode();
    // Force iframe refresh to apply new event listeners
    setKey(prev => prev + 1);
  };

  // Fix error from console
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
    } catch (_e) {
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false } : l));
    }
  };

  // Helper functions
  const reloadPreview = () => {
    setKey(prev => prev + 1);
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
              { id: 'run', icon: Play, label: 'Run', hasIndicator: true },
              { id: 'preview', icon: Eye, label: 'Preview' },
              { id: 'code', icon: Code2, label: 'Code' },
              { id: 'codemap', icon: Map, label: 'CodeMap' },
              { id: 'git', icon: GitBranch, label: 'Git' },
              { id: 'webcontainer', icon: Box, label: 'WebContainer' },
              { id: 'database', icon: Database, label: 'DB Studio' },
              { id: 'quality', icon: ShieldCheck, label: 'Quality' },
              { id: 'docs', icon: FileText, label: 'Docs' },
              { id: 'env', icon: ShieldCheck, label: 'Env' },
              { id: 'debug', icon: Bug, label: 'Debug' },
              { id: 'errorfix', icon: Bot, label: 'Error Fix' }
            ].map(({ id, icon: Icon, label, hasIndicator }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id as TabType)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                } ${hasIndicator && isRunnerActive ? 'ring-1 ring-emerald-500/50' : ''}`}
                title={label}
              >
                <div className="relative">
                  <Icon className={`w-3.5 h-3.5 ${hasIndicator && isRunnerActive ? 'text-emerald-400' : ''}`} />
                  {hasIndicator && isRunnerActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  )}
                </div>
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
                  <button
                    onClick={handleToggleInspectMode}
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
                            disabled={isFixingResponsiveness}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50"
                          >
                            {isFixingResponsiveness ? (
                              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                            ) : (
                              <Wrench className="w-4 h-4 text-indigo-400" />
                            )}
                            <span className="text-sm text-slate-200">{isFixingResponsiveness ? 'Fixing...' : 'Fix Responsive'}</span>
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
              files={files}
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
              onUndo={onUndo}
              canUndo={canUndo}
            />
          </div>
        ) : activeTab === 'quality' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <CodeQualityPanel
              files={files}
              activeFile={activeFile}
              onRunLint={() => {}}
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
            isFixingResp={isFixingResponsiveness}
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
            onCloseInspector={exitInspectMode}
            onInspectEdit={inspectModeHandleEdit}
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
        {activeTab === 'preview' && <AccessibilityModal isOpen={showAccessReport} onClose={() => setShowAccessReport(false)} report={accessibilityReport} isAuditing={isAuditing} isFixing={isFixingAccessibility} onFix={fixAccessibilityIssues} />}
      </div>
    </section>
  );
});
