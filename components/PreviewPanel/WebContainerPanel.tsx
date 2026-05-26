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
  { label: string; colorVar: string; icon: React.ReactNode }
> = {
  idle: {
    label: 'Idle',
    colorVar: 'var(--theme-text-muted)',
    icon: <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-text-muted)' }} />,
  },
  initializing: {
    label: 'Initializing...',
    colorVar: 'var(--color-info)',
    icon: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-info)' }} />,
  },
  booting: {
    label: 'Booting...',
    colorVar: 'var(--color-info)',
    icon: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-info)' }} />,
  },
  ready: {
    label: 'Ready',
    colorVar: 'var(--color-success)',
    icon: <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-success)' }} />,
  },
  installing: {
    label: 'Installing dependencies...',
    colorVar: 'var(--color-warning)',
    icon: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-warning)' }} />,
  },
  starting: {
    label: 'Starting server...',
    colorVar: 'var(--color-warning)',
    icon: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-warning)' }} />,
  },
  running: {
    label: 'Running',
    colorVar: 'var(--color-success)',
    icon: <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />,
  },
  error: {
    label: 'Error',
    colorVar: 'var(--color-error)',
    icon: <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-error)' }} />,
  },
  stopped: {
    label: 'Stopped',
    colorVar: 'var(--theme-text-muted)',
    icon: <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-text-muted)' }} />,
  },
  syncing: {
    label: 'Syncing files...',
    colorVar: 'var(--color-feature)',
    icon: <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-feature)' }} />,
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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
          <FolderOpen className="w-8 h-8" style={{ color: 'var(--color-warning)' }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>No Project Selected</h3>
        <p className="text-sm mb-6 max-w-md" style={{ color: 'var(--theme-text-muted)' }}>
          Select or create a project first to use WebContainer preview.
          WebContainer runs your project with a real Node.js runtime in the browser.
        </p>
        {onOpenProjectManager && (
          <button
            onClick={onOpenProjectManager}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--theme-text-on-accent)' }}
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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
          <Terminal className="w-8 h-8" style={{ color: 'var(--theme-text-dim)' }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>WebContainer Not Configured</h3>
        <p className="text-sm mb-6 max-w-md" style={{ color: 'var(--theme-text-muted)' }}>
          WebContainer allows you to run your project in a browser-based Node.js runtime. Configure
          your StackBlitz Client ID to get started.
        </p>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-info)', color: 'var(--theme-text-on-accent)' }}
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
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {statusConfig.icon}
            <span className="text-sm font-medium" style={{ color: statusConfig.colorVar }}>
              {statusConfig.label}
            </span>
          </div>
          {state.serverUrl && (
            <a
              href={state.serverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--theme-text-dim)' }}
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
            className="p-1.5 rounded-md transition-colors"
            style={{
              backgroundColor: showLogs ? 'var(--theme-glass-300)' : 'transparent',
              color: showLogs ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
            }}
            title="Toggle logs"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {/* Sync files */}
          {canSync && (
            <button
              onClick={handleSync}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Sync files to WebContainer"
            >
              <Upload className="w-4 h-4" />
            </button>
          )}

          {/* Refresh preview */}
          {isRunning && (
            <button
              onClick={handleRefreshPreview}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-on-accent)' }}
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          ) : isRunning ? (
            <>
              <button
                onClick={handleRestart}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{ backgroundColor: 'var(--color-warning)', color: 'var(--theme-text-on-accent)' }}
              >
                <RefreshCw className="w-4 h-4" />
                Restart
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{ backgroundColor: 'var(--color-error)', color: 'var(--theme-text-on-accent)' }}
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          ) : isBusy ? (
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md cursor-not-allowed"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {statusConfig.label}
            </button>
          ) : null}

          {/* Destroy */}
          {state.status !== 'idle' && (
            <button
              onClick={handleDestroy}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Destroy WebContainer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="WebContainer settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'var(--color-error-subtle)', borderBottom: '1px solid var(--color-error-border)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
          <span className="text-sm" style={{ color: 'var(--color-error)' }}>{state.error}</span>
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
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center h-full" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
              {isBusy ? (
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: 'var(--color-info)' }} />
                  <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{statusConfig.label}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--theme-text-dim)' }} />
                  <p className="text-sm" style={{ color: 'var(--theme-text-dim)' }}>
                    Click &quot;Start&quot; to boot WebContainer
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Logs panel */}
        {showLogs && (
          <div className="w-1/2 flex flex-col" style={{ borderLeft: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--theme-text-muted)' }}>Logs</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => webContainerService.clearLogs()}
                  className="p-1 rounded"
                  style={{ color: 'var(--theme-text-dim)' }}
                  title="Clear logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-1 rounded"
                  style={{ color: 'var(--theme-text-dim)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div ref={logsContainerRef} className="flex-1 overflow-auto p-3 font-mono text-xs">
              {state.logs.length === 0 ? (
                <p style={{ color: 'var(--theme-text-dim)' }}>No logs yet...</p>
              ) : (
                state.logs.map((log, index) => (
                  <div
                    key={index}
                    className="whitespace-pre-wrap break-all mb-1"
                    style={{
                      color: log.includes('error') || log.includes('Error')
                        ? 'var(--color-error)'
                        : log.includes('warning') || log.includes('Warning')
                          ? 'var(--color-warning)'
                          : log.includes('success') || log.includes('ready')
                            ? 'var(--color-success)'
                            : 'var(--theme-text-muted)'
                    }}
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
