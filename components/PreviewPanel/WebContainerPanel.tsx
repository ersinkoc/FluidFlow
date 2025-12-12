/**
 * WebContainerPanel
 * In-browser Node.js runtime preview using WebContainer API
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Terminal,
  X,
  AlertCircle,
  Loader2,
  CheckCircle,
  Settings,
  ExternalLink,
  Trash2,
  FolderOpen,
  Upload,
} from 'lucide-react';
import type { FileSystem } from '@/types';
import {
  webContainerService,
  type WebContainerState,
  type WebContainerStatus,
} from '@/services/webcontainer';

interface WebContainerPanelProps {
  files: FileSystem;
  projectId?: string | null;
  onOpenSettings?: () => void;
  onOpenProjectManager?: () => void;
}

const STATUS_CONFIG: Record<
  WebContainerStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  idle: {
    label: 'Idle',
    color: 'text-zinc-400',
    icon: <div className="w-2 h-2 rounded-full bg-zinc-400" />,
  },
  initializing: {
    label: 'Initializing...',
    color: 'text-blue-400',
    icon: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  },
  booting: {
    label: 'Booting...',
    color: 'text-blue-400',
    icon: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  },
  ready: {
    label: 'Ready',
    color: 'text-green-400',
    icon: <CheckCircle className="w-4 h-4 text-green-400" />,
  },
  installing: {
    label: 'Installing dependencies...',
    color: 'text-amber-400',
    icon: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />,
  },
  starting: {
    label: 'Starting server...',
    color: 'text-amber-400',
    icon: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />,
  },
  running: {
    label: 'Running',
    color: 'text-green-400',
    icon: <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />,
  },
  error: {
    label: 'Error',
    color: 'text-red-400',
    icon: <AlertCircle className="w-4 h-4 text-red-400" />,
  },
  stopped: {
    label: 'Stopped',
    color: 'text-zinc-400',
    icon: <div className="w-2 h-2 rounded-full bg-zinc-400" />,
  },
  syncing: {
    label: 'Syncing files...',
    color: 'text-purple-400',
    icon: <Loader2 className="w-4 h-4 animate-spin text-purple-400" />,
  },
};

export const WebContainerPanel: React.FC<WebContainerPanelProps> = ({
  files,
  projectId,
  onOpenSettings,
  onOpenProjectManager,
}) => {
  const [state, setState] = useState<WebContainerState>(webContainerService.getState());
  const [showLogs, setShowLogs] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Check if WebContainer is enabled
  useEffect(() => {
    const settings = webContainerService.getSettings();
    setIsConfigured(!!settings?.enabled);
  }, []);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = webContainerService.subscribe(setState);
    return unsubscribe;
  }, []);

  // Auto-scroll logs (scroll container, not page)
  useEffect(() => {
    if (showLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [state.logs, showLogs]);

  const handleStart = useCallback(async () => {
    // Start WebContainer with current files (no auth needed for public packages)
    await webContainerService.start(files);
  }, [files]);

  const handleStop = useCallback(async () => {
    await webContainerService.stopDevServer();
  }, []);

  const handleRestart = useCallback(async () => {
    await webContainerService.stopDevServer();
    await webContainerService.start(files);
  }, [files]);

  const handleDestroy = useCallback(async () => {
    await webContainerService.destroy();
  }, []);

  const handleRefreshPreview = useCallback(() => {
    if (iframeRef.current && state.serverUrl) {
      iframeRef.current.src = state.serverUrl;
    }
  }, [state.serverUrl]);

  const handleSync = useCallback(async () => {
    await webContainerService.syncFiles(files);
  }, [files]);

  const statusConfig = STATUS_CONFIG[state.status];
  const isRunning = state.status === 'running';
  const isBusy = ['booting', 'installing', 'starting', 'initializing', 'syncing'].includes(state.status);
  const canSync = webContainerService.isBooted() && !isBusy;

  // No project selected
  if (!projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No Project Selected</h3>
        <p className="text-zinc-400 text-sm mb-6 max-w-md">
          Select or create a project first to use WebContainer preview.
          WebContainer runs your project with a real Node.js runtime in the browser.
        </p>
        {onOpenProjectManager && (
          <button
            onClick={onOpenProjectManager}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Open Project Manager
          </button>
        )}
      </div>
    );
  }

  // Not configured state
  if (!isConfigured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
          <Terminal className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">WebContainer Not Configured</h3>
        <p className="text-zinc-400 text-sm mb-6 max-w-md">
          WebContainer allows you to run your project in a browser-based Node.js runtime. Configure
          your StackBlitz Client ID to get started.
        </p>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configure WebContainer
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {statusConfig.icon}
            <span className={`text-sm font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
          {state.serverUrl && (
            <a
              href={state.serverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {state.serverUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Logs toggle */}
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`p-1.5 rounded-md transition-colors ${
              showLogs
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
            title="Toggle logs"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {/* Sync files */}
          {canSync && (
            <button
              onClick={handleSync}
              className="p-1.5 text-zinc-400 hover:text-purple-400 hover:bg-zinc-800 rounded-md transition-colors"
              title="Sync files to WebContainer"
            >
              <Upload className="w-4 h-4" />
            </button>
          )}

          {/* Refresh preview */}
          {isRunning && (
            <button
              onClick={handleRefreshPreview}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
              title="Refresh preview"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Start/Stop buttons */}
          {state.status === 'idle' || state.status === 'error' || state.status === 'stopped' ? (
            <button
              onClick={handleStart}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          ) : isRunning ? (
            <>
              <button
                onClick={handleRestart}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Restart
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-md transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          ) : isBusy ? (
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 text-zinc-400 text-sm rounded-md cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {statusConfig.label}
            </button>
          ) : null}

          {/* Destroy */}
          {state.status !== 'idle' && (
            <button
              onClick={handleDestroy}
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
              title="Destroy WebContainer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
            title="WebContainer settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{state.error}</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview iframe */}
        <div className={`flex-1 ${showLogs ? 'w-1/2' : 'w-full'}`}>
          {isRunning && state.serverUrl ? (
            <iframe
              ref={iframeRef}
              src={state.serverUrl}
              className="w-full h-full border-0 bg-white"
              title="WebContainer Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center h-full bg-zinc-950">
              {isBusy ? (
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">{statusConfig.label}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Terminal className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm">
                    Click &quot;Start&quot; to boot WebContainer
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Logs panel */}
        {showLogs && (
          <div className="w-1/2 border-l border-zinc-800 flex flex-col bg-zinc-950">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <span className="text-xs font-medium text-zinc-400">Logs</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => webContainerService.clearLogs()}
                  className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
                  title="Clear logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div ref={logsContainerRef} className="flex-1 overflow-auto p-3 font-mono text-xs">
              {state.logs.length === 0 ? (
                <p className="text-zinc-600">No logs yet...</p>
              ) : (
                state.logs.map((log, index) => (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap break-all mb-1 ${
                      log.includes('error') || log.includes('Error')
                        ? 'text-red-400'
                        : log.includes('warning') || log.includes('Warning')
                          ? 'text-amber-400'
                          : log.includes('success') || log.includes('ready')
                            ? 'text-green-400'
                            : 'text-zinc-400'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebContainerPanel;
