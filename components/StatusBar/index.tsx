/**
 * StatusBar - IDE-style status bar at the bottom of the application
 *
 * Displays:
 * - Project name (clickable to open projects)
 * - Git branch and status (clickable to open git tab)
 * - Server/backend connection status
 * - Error/warning counts from console
 * - Current file info (line/column, encoding)
 * - AI model and generation status
 *
 * Uses StatusBarContext for shared state from PreviewPanel and CodeEditor.
 */
import React, { memo, useMemo, useState, useEffect } from 'react';
import {
  GitBranch,
  Wifi,
  WifiOff,
  AlertCircle,
  AlertTriangle,
  Check,
  Loader2,
  Cloud,
  CloudOff,
  Bot,
  FileCode,
  Circle,
  FolderOpen,
  ChevronDown,
  Undo2,
  Redo2,
  History,
  Info,
  GitCommitHorizontal,
  Sparkles,
  ArrowUpCircle,
  ShieldAlert,
  BarChart3,
} from 'lucide-react';
import { useAppContext } from '../../contexts/AppContext';
import { useUI } from '../../contexts/UIContext';
import { useStatusBar } from '../../contexts/StatusBarContext';
import { getTokenSavings } from '../../services/context';
import { checkForUpdatesWithCache, APP_VERSION, type UpdateCheckResult } from '../../services/version';
import { getQuickHealthStatus, type HealthStatus } from '../../services/projectHealth';

interface StatusBarProps {
  onOpenGitTab?: () => void;
  onOpenProjectsTab?: () => void;
  onOpenHistoryPanel?: () => void;
  onOpenCredits?: () => void;
  onOpenHealthCheck?: () => void;
  onOpenAIUsage?: () => void;
  isAutoCommitting?: boolean;
}

export const StatusBar = memo(function StatusBar({
  onOpenGitTab,
  onOpenProjectsTab,
  onOpenHistoryPanel,
  onOpenCredits,
  onOpenHealthCheck,
  onOpenAIUsage,
  isAutoCommitting = false,
}: StatusBarProps) {
  // Get state from contexts
  const ctx = useAppContext();
  const ui = useUI();
  const statusBar = useStatusBar();

  // Update check state
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdatesWithCache().then(setUpdateCheck);
  }, []);

  // Project health status
  const healthStatus = useMemo<HealthStatus>(() => {
    const files = ctx.files;
    if (!files || Object.keys(files).length === 0) return 'healthy';
    return getQuickHealthStatus(files);
  }, [ctx.files]);

  // Auto-commit state
  const { autoCommitEnabled, setAutoCommitEnabled } = ui;

  // Destructure status bar state
  const {
    errorCount,
    warningCount,
    cursorPosition,
    autoFixEnabled,
    isAutoFixing,
    isRunnerActive,
  } = statusBar;

  // Git status
  const gitBranch = ctx.gitStatus?.branch || 'main';
  const hasUncommitted = ctx.hasUncommittedChanges;
  const gitInitialized = ctx.gitStatus?.initialized ?? false;

  // Connection & sync status
  const isOnline = ctx.isServerOnline;
  const isSyncing = ctx.isSyncing;

  // AI status
  const isGenerating = ui.isGenerating;
  const selectedModel = ui.selectedModel;

  // History state
  const canUndo = ctx.canUndo;
  const canRedo = ctx.canRedo;
  const currentIndex = ctx.currentIndex;
  const historyLength = ctx.historyLength;

  // Extract model name from model ID
  const getModelDisplayName = (modelId: string): string => {
    // Handle different model ID formats
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      const name = parts[parts.length - 1];
      // Shorten common model names
      if (name.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
      if (name.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
      if (name.includes('gemini-3-pro')) return 'Gemini 3 Pro';
      if (name.includes('gemini-3-flash')) return 'Gemini 3 Flash';
      if (name.includes('gpt-4o')) return 'GPT-4o';
      if (name.includes('gpt-4')) return 'GPT-4';
      if (name.includes('claude-3')) return 'Claude 3';
      if (name.includes('claude')) return 'Claude';
      return name;
    }
    return modelId;
  };

  // File info
  const activeFile = ctx.activeFile;
  const fileExtension = activeFile?.split('.').pop()?.toUpperCase() || 'TXT';

  // Project info
  const projectName = ctx.currentProject?.name;

  // File context token savings
  const tokensSaved = useMemo(() => {
    const files = ctx.files;
    if (!files || Object.keys(files).length === 0) return 0;
    return getTokenSavings(files);
  }, [ctx.files]);

  // Format token savings for display
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return String(tokens);
  };

  return (
    <footer
      className="h-8 bg-slate-900/80 backdrop-blur-sm border-t border-white/5 text-slate-400 flex items-center justify-between px-2 text-xs font-mono select-none shrink-0"
    >
      {/* Left Section */}
      <div className="flex items-center gap-0.5 h-full">
        {/* Project Name */}
        <button
          onClick={onOpenProjectsTab}
          className="flex items-center gap-1.5 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors rounded group"
          title={projectName ? `Project: ${projectName}` : 'No project - Click to open projects'}
        >
          <FolderOpen className="w-3 h-3 text-blue-400" />
          <span className="max-w-[100px] truncate text-slate-300">
            {projectName || 'No Project'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>

        {/* Separator */}
        <div className="w-px h-3 bg-white/10 mx-1" />

        {/* Git Branch - clickable to open git tab */}
        <button
          onClick={onOpenGitTab}
          className={`flex items-center gap-1.5 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors rounded ${
            gitInitialized ? '' : 'text-slate-500'
          }`}
          title={
            gitInitialized
              ? `Branch: ${gitBranch}${hasUncommitted ? ' (uncommitted changes)' : ''} - Click to open Git`
              : 'No Git - Click to initialize'
          }
        >
          <GitBranch className={`w-3 h-3 ${
            gitInitialized
              ? hasUncommitted ? 'text-amber-400' : 'text-emerald-400'
              : ''
          }`} />
          {gitInitialized ? (
            <>
              <span className={`max-w-[80px] truncate ${hasUncommitted ? 'text-amber-400' : ''}`}>
                {gitBranch}
              </span>
              {hasUncommitted && (
                <Circle className="w-1.5 h-1.5 fill-amber-400 text-amber-400" />
              )}
            </>
          ) : (
            <span className="italic text-[10px]">no git</span>
          )}
        </button>

        {/* Auto-commit toggle - next to git branch */}
        {gitInitialized && (
          <button
            onClick={() => setAutoCommitEnabled(!autoCommitEnabled)}
            className={`flex items-center gap-1 px-1.5 h-full rounded transition-colors ${
              autoCommitEnabled
                ? isAutoCommitting
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
                : 'text-slate-500 hover:text-slate-400 hover:bg-white/5'
            }`}
            title={
              isAutoCommitting
                ? 'Auto-committing...'
                : autoCommitEnabled
                  ? 'Auto-commit ON: Commits when preview is error-free'
                  : 'Auto-commit OFF: Click to enable'
            }
          >
            {isAutoCommitting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <GitCommitHorizontal className="w-3 h-3" />
            )}
            <span className="text-[10px]">Auto</span>
          </button>
        )}

        {/* Separator */}
        <div className="w-px h-3 bg-white/10 mx-1" />

        {/* Backend Status */}
        <div
          className={`flex items-center gap-1.5 px-2 h-full transition-colors rounded ${
            isSyncing ? 'text-blue-400' : 'hover:bg-white/5 cursor-pointer'
          }`}
          title={isSyncing ? 'Syncing...' : isOnline ? 'Backend connected' : 'Backend offline'}
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[10px]">Syncing</span>
            </>
          ) : isOnline ? (
            <>
              <Cloud className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Backend</span>
            </>
          ) : (
            <>
              <CloudOff className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">Offline</span>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-white/10 mx-1" />

        {/* Errors & Warnings */}
        <button
          className="flex items-center gap-2 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors rounded"
          title={`${errorCount} error(s), ${warningCount} warning(s)`}
        >
          <div className={`flex items-center gap-1 ${errorCount > 0 ? 'text-red-400' : ''}`}>
            <AlertCircle className="w-3 h-3" />
            <span>{errorCount}</span>
          </div>
          <div className={`flex items-center gap-1 ${warningCount > 0 ? 'text-amber-400' : ''}`}>
            <AlertTriangle className="w-3 h-3" />
            <span>{warningCount}</span>
          </div>
        </button>

        {/* Project Health Indicator */}
        {healthStatus !== 'healthy' && (
          <>
            <div className="w-px h-3 bg-white/10 mx-1" />
            <button
              onClick={onOpenHealthCheck}
              className={`flex items-center gap-1 px-2 h-full rounded transition-colors hover:bg-white/5 ${
                healthStatus === 'critical' ? 'text-red-400' : 'text-amber-400'
              }`}
              title={
                healthStatus === 'critical'
                  ? 'Critical: Missing required files - Click to fix'
                  : 'Warning: Some config files need attention'
              }
            >
              <ShieldAlert className="w-3 h-3" />
              <span className="text-[10px]">
                {healthStatus === 'critical' ? 'Fix Required' : 'Check Health'}
              </span>
            </button>
          </>
        )}

        {/* Token Savings Indicator */}
        {tokensSaved > 0 && (
          <>
            <div className="w-px h-3 bg-white/10 mx-1" />
            <div
              className="flex items-center gap-1 px-2 h-full text-purple-400"
              title={`Smart context: ${tokensSaved.toLocaleString()} tokens saved by not re-sending unchanged files`}
            >
              <Sparkles className="w-3 h-3" />
              <span className="text-[10px]">-{formatTokens(tokensSaved)}</span>
            </div>
          </>
        )}

        {/* Runner Status */}
        {isRunnerActive && (
          <>
            <div className="w-px h-3 bg-white/10 mx-1" />
            <div
              className="flex items-center gap-1.5 px-2 h-full text-emerald-400"
              title="Dev server running"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Running</span>
            </div>
          </>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1 h-full">
        {/* Cursor Position */}
        {cursorPosition && (
          <div className="hover:bg-white/5 px-2 h-full flex items-center cursor-pointer rounded">
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </div>
        )}

        {/* File Type */}
        <div className="hover:bg-white/5 px-2 h-full flex items-center cursor-pointer rounded gap-1">
          <FileCode className="w-3 h-3" />
          <span>{fileExtension}</span>
        </div>

        {/* Encoding */}
        <div className="hover:bg-white/5 px-2 h-full flex items-center cursor-pointer rounded">
          UTF-8
        </div>

        {/* Auto-fix Status */}
        {autoFixEnabled && (
          <div
            className={`flex items-center gap-1 px-2 h-full rounded ${
              isAutoFixing ? 'text-amber-400' : 'text-emerald-400'
            }`}
            title={isAutoFixing ? 'Auto-fixing error...' : 'Auto-fix enabled'}
          >
            {isAutoFixing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>AutoFix</span>
          </div>
        )}

        {/* Separator */}
        <div className="w-px h-3 bg-white/10 mx-0.5" />

        {/* History Controls */}
        <div className="flex items-center h-full">
          {/* Undo */}
          <button
            onClick={ctx.undo}
            disabled={!canUndo}
            className={`px-1.5 h-full flex items-center rounded transition-colors ${
              canUndo
                ? 'hover:bg-white/5 text-slate-300'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Undo"
          >
            <Undo2 className="w-3 h-3" />
          </button>

          {/* Position Indicator - opens History Panel */}
          <button
            onClick={onOpenHistoryPanel}
            className="flex items-center gap-0.5 px-1 h-full hover:bg-white/5 rounded transition-colors group"
            title="History Timeline"
          >
            <span className="text-slate-400 group-hover:text-white transition-colors text-[10px] tabular-nums">
              {currentIndex + 1}/{historyLength}
            </span>
            <History className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </button>

          {/* Redo */}
          <button
            onClick={ctx.redo}
            disabled={!canRedo}
            className={`px-1.5 h-full flex items-center rounded transition-colors ${
              canRedo
                ? 'hover:bg-white/5 text-slate-300'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Redo"
          >
            <Redo2 className="w-3 h-3" />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-white/10 mx-0.5" />

        {/* AI Model & Status */}
        <div
          className={`flex items-center gap-1.5 px-2 h-full rounded ${
            isGenerating
              ? 'text-blue-400 bg-blue-500/10'
              : 'hover:bg-white/5 cursor-pointer'
          }`}
          title={isGenerating ? 'AI is generating...' : `Model: ${selectedModel}`}
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Bot className="w-3 h-3" />
          )}
          <span className="max-w-[120px] truncate">
            {isGenerating ? 'Generating...' : getModelDisplayName(selectedModel)}
          </span>
        </div>

        {/* AI Usage Stats */}
        <button
          onClick={onOpenAIUsage}
          className="px-2 h-full flex items-center gap-1 hover:bg-white/5 rounded transition-colors text-slate-400 hover:text-blue-400"
          title="AI Usage Analytics"
        >
          <BarChart3 className="w-3 h-3" />
          <span className="text-[10px]">Stats</span>
        </button>

        {/* Connection Status */}
        <div
          className={`px-2 h-full flex items-center rounded ${
            isOnline ? 'text-emerald-400' : 'text-red-400'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        >
          {isOnline ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
        </div>

        {/* Version & About FluidFlow */}
        <button
          onClick={onOpenCredits}
          className={`px-2 h-full flex items-center gap-1 hover:bg-white/5 rounded transition-colors ${
            updateCheck?.hasUpdate ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
          }`}
          title={
            updateCheck?.hasUpdate
              ? `Update available: v${updateCheck.latestVersion} (current: v${APP_VERSION})`
              : `FluidFlow v${APP_VERSION}`
          }
        >
          {updateCheck?.hasUpdate ? (
            <>
              <ArrowUpCircle className="w-3 h-3" />
              <span className="text-[10px]">v{updateCheck.latestVersion}</span>
            </>
          ) : (
            <>
              <Info className="w-3 h-3" />
              <span className="text-[10px]">v{APP_VERSION}</span>
            </>
          )}
        </button>
      </div>
    </footer>
  );
});

export default StatusBar;
