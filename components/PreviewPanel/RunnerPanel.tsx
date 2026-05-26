import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  ExternalLink,
  Loader2,
  Terminal,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  X,
  StopCircle,
  Maximize2,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { runnerApi, RunningProjectInfo } from '@/services/projectApi';
import { useLogStream } from '@/hooks/useLogStream';
import { useUI } from '@/contexts/UIContext';

// Valid status values for the runner
type RunnerStatus = 'installing' | 'starting' | 'running' | 'error' | 'stopped';

// Device presets for responsive testing
type DeviceType = 'desktop' | 'tablet' | 'mobile';
const DEVICE_SIZES: Record<DeviceType, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: 'Desktop' },
  tablet: { width: 768, height: 1024, label: 'Tablet' },
  mobile: { width: 375, height: 667, label: 'Mobile' }
};

// Console log entry from iframe
interface ConsoleLogEntry {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
}

// Network request entry from iframe
interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
}

// DevTools tab type
type DevToolsTab = 'terminal' | 'console' | 'network';

interface RunnerPanelProps {
  projectId: string | null;
  projectName?: string;
  hasCommittedFiles?: boolean;
  files?: Record<string, string>;
}

export const RunnerPanel: React.FC<RunnerPanelProps> = ({
  projectId,
  projectName: _projectName,
  hasCommittedFiles,
  files
}) => {
  const [status, setStatus] = useState<RunningProjectInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // DevTools state
  const [devToolsTab, setDevToolsTab] = useState<DevToolsTab>('terminal');
  const [devToolsExpanded, setDevToolsExpanded] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkEntry[]>([]);

  // Get resetCounter to clear logs on Start Fresh
  const { resetCounter } = useUI();
  const prevResetCounterRef = useRef(resetCounter);

  // Determine effective project ID (use '_temp' for VFS-only runs)
  const effectiveProjectId = projectId || (files && Object.keys(files).length > 0 ? '_temp' : null);

  const isRunning = status?.running || status?.status === 'installing' || status?.status === 'starting';
  const isServerReady = status?.status === 'running' && status?.url;

  // SSE status change handler - memoized to prevent hook re-runs
  const handleStatusChange = useCallback((newStatus: string) => {
    if (newStatus === 'stopped') {
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
    }
  }, [setStatus]);

  // SSE-based log streaming
  const { logs: terminalLogs, connected: sseConnected, clearLogs: clearTerminalLogs } = useLogStream({
    projectId: effectiveProjectId,
    enabled: isRunning,
    onStatusChange: handleStatusChange
  });

  // Clear all logs when reset is triggered (Start Fresh)
  useEffect(() => {
    if (resetCounter !== prevResetCounterRef.current) {
      prevResetCounterRef.current = resetCounter;
      setConsoleLogs([]);
      setNetworkLogs([]);
      clearTerminalLogs();
      setError(null);
      setStatus(null);
      console.log('[RunnerPanel] Cleared all logs on reset');
    }
  }, [resetCounter, clearTerminalLogs]);

  // Listen for postMessage from iframe (console/network)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      // FIX-07: Validate origin - allow localhost runner ports (33xx) and same-origin
      const validOrigin = event.origin === window.location.origin ||
        /^https?:\/\/localhost:33\d{2}$/.test(event.origin);
      if (!validOrigin) return;

      if (event.data.type === 'RUNNER_CONSOLE') {
        setConsoleLogs(prev => [...prev.slice(-499), {
          id: crypto.randomUUID(),
          type: event.data.logType || 'log',
          message: event.data.message || '',
          timestamp: event.data.timestamp || Date.now()
        }]);
      } else if (event.data.type === 'RUNNER_NETWORK') {
        setNetworkLogs(prev => [...prev.slice(-499), {
          id: crypto.randomUUID(),
          method: event.data.method || 'GET',
          url: event.data.url || '',
          status: event.data.status || 0,
          statusText: event.data.statusText || '',
          duration: event.data.duration || 0,
          timestamp: event.data.timestamp || Date.now()
        }]);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Fetch status (for initial load and fallback)
  const fetchStatus = useCallback(async () => {
    if (!effectiveProjectId) return;

    try {
      const result = await runnerApi.status(effectiveProjectId);
      setStatus(result);
    } catch (_err) {
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
    }
  }, [effectiveProjectId]);

  // Poll for status (less frequent since we have SSE)
  useEffect(() => {
    fetchStatus();

    pollRef.current = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchStatus]);

  // Auto-scroll terminal logs (throttled to prevent jank)
  const terminalRef = useRef<HTMLDivElement>(null);
  const scrollRequestRef = useRef<number | null>(null);
  const lastLogCountRef = useRef(0);

  useEffect((): (() => void) | undefined => {
    // Only scroll if new logs were added (not on every render)
    if (terminalLogs.length === lastLogCountRef.current) return undefined;
    lastLogCountRef.current = terminalLogs.length;

    if (terminalRef.current && devToolsTab === 'terminal') {
      // Cancel pending scroll request
      if (scrollRequestRef.current) {
        cancelAnimationFrame(scrollRequestRef.current);
      }
      // Schedule scroll on next frame
      scrollRequestRef.current = requestAnimationFrame(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
        scrollRequestRef.current = null;
      });
    }

    return () => {
      if (scrollRequestRef.current) {
        cancelAnimationFrame(scrollRequestRef.current);
      }
    };
  }, [terminalLogs.length, devToolsTab]);

  // Start project
  const handleStart = async () => {
    if (!effectiveProjectId) return;

    setIsLoading(true);
    setError(null);
    setConsoleLogs([]);
    setNetworkLogs([]);

    try {
      const shouldSyncFiles = !hasCommittedFiles && files && Object.keys(files).length > 0;
      const result = await runnerApi.start(effectiveProjectId, shouldSyncFiles ? files : undefined);
      setStatus({
        projectId: effectiveProjectId,
        port: result.port,
        url: result.url,
        status: result.status as RunnerStatus,
        startedAt: Date.now(),
        running: true
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start project');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop project
  const handleStop = async () => {
    if (!effectiveProjectId) return;

    setIsLoading(true);
    setError(null);

    try {
      await runnerApi.stop(effectiveProjectId);
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop project');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear logs
  const handleClearLogs = () => {
    if (devToolsTab === 'terminal') {
      clearTerminalLogs();
    } else if (devToolsTab === 'console') {
      setConsoleLogs([]);
    } else if (devToolsTab === 'network') {
      setNetworkLogs([]);
    }
  };

  // Stop all servers
  const handleStopAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await runnerApi.stopAll();
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop servers');
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh iframe
  const handleRefreshIframe = () => {
    setIframeKey(prev => prev + 1);
  };

  // Status badge
  const getStatusBadge = () => {
    if (!status) return null;

    switch (status.status) {
      case 'installing':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
            <Loader2 size={12} className="animate-spin" />
            Installing...
          </span>
        );
      case 'starting':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
            <Loader2 size={12} className="animate-spin" />
            Starting...
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
            <CheckCircle2 size={12} />
            Running
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
            <XCircle size={12} />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
            <Square size={12} />
            Stopped
          </span>
        );
    }
  };

  // Get log counts for tabs
  const errorCount = consoleLogs.filter(l => l.type === 'error').length;
  const warnCount = consoleLogs.filter(l => l.type === 'warn').length;

  // Check if we have something to run
  const hasFilesToRun = files && Object.keys(files).length > 0;

  if (!effectiveProjectId && !hasFilesToRun) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center" style={{ color: 'var(--theme-text-muted)' }}>
        <Terminal size={48} className="mb-4 opacity-50" />
        <p className="text-sm">No project or files to run</p>
        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>Create or open a project to run it in development mode</p>
      </div>
    );
  }

  // Fullscreen Preview Modal
  const FullscreenPreview = () => (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--theme-surface-dark)' }}
      onClick={() => setIsFullscreen(false)}
    >
      <div
        className="flex-none flex items-center justify-between p-3"
        style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>Running App</span>
          {status?.url && (
            <span className="px-2 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
              {status.url}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
            <button onClick={() => setDeviceType('desktop')} className="p-1.5 rounded" style={{ backgroundColor: deviceType === 'desktop' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'desktop' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Desktop">
              <Monitor size={14} />
            </button>
            <button onClick={() => setDeviceType('tablet')} className="p-1.5 rounded" style={{ backgroundColor: deviceType === 'tablet' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'tablet' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Tablet">
              <Tablet size={14} />
            </button>
            <button onClick={() => setDeviceType('mobile')} className="p-1.5 rounded" style={{ backgroundColor: deviceType === 'mobile' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'mobile' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Mobile">
              <Smartphone size={14} />
            </button>
          </div>
          <button onClick={handleRefreshIframe} className="p-1.5 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <a href={status?.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Open in new tab">
            <ExternalLink size={14} />
          </a>
          <button onClick={() => setIsFullscreen(false)} className="p-1.5 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" style={{ backgroundColor: 'var(--theme-surface-dark)' }} onClick={(e) => e.stopPropagation()}>
        <div
          className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
          style={{
            width: deviceType === 'desktop' ? '100%' : DEVICE_SIZES[deviceType].width,
            height: deviceType === 'desktop' ? '100%' : DEVICE_SIZES[deviceType].height,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
        >
          {status?.url && (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={status.url}
              className="w-full h-full border-0"
              title="Running App Preview"
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  );

  // DevTools Panel Component
  const DevToolsPanel = () => (
    <div className={`flex-none ${devToolsExpanded ? 'h-48' : 'h-8'} transition-all`} style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-200)' }}>
      {/* Tabs */}
      <div className="flex items-center justify-between h-8 px-2" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
        <div className="flex items-center gap-1">
          {/* Tab buttons */}
          <button
            onClick={() => { setDevToolsTab('terminal'); setDevToolsExpanded(true); }}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] rounded"
            style={{ backgroundColor: devToolsTab === 'terminal' ? 'var(--color-success-subtle)' : 'transparent', color: devToolsTab === 'terminal' ? 'var(--color-success)' : 'var(--theme-text-muted)' }}
          >
            <Terminal size={10} />
            Terminal
            {terminalLogs.length > 0 && <span className="px-1 rounded text-[9px]" style={{ backgroundColor: 'var(--theme-glass-300)' }}>{terminalLogs.length}</span>}
            {sseConnected && <Wifi size={8} style={{ color: 'var(--color-success)' }} />}
            {!sseConnected && isRunning && <WifiOff size={8} style={{ color: 'var(--color-error)' }} />}
          </button>
          <button
            onClick={() => { setDevToolsTab('console'); setDevToolsExpanded(true); }}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] rounded"
            style={{ backgroundColor: devToolsTab === 'console' ? 'var(--color-info-subtle)' : 'transparent', color: devToolsTab === 'console' ? 'var(--color-info)' : 'var(--theme-text-muted)' }}
          >
            <AlertCircle size={10} />
            Console
            {consoleLogs.length > 0 && (
              <span className="px-1 rounded text-[9px]" style={{ backgroundColor: errorCount > 0 ? 'var(--color-error-subtle)' : warnCount > 0 ? 'var(--color-warning-subtle)' : 'var(--theme-glass-300)', color: errorCount > 0 ? 'var(--color-error)' : warnCount > 0 ? 'var(--color-warning)' : 'inherit' }}>
                {consoleLogs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setDevToolsTab('network'); setDevToolsExpanded(true); }}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] rounded"
            style={{ backgroundColor: devToolsTab === 'network' ? 'var(--color-feature-subtle)' : 'transparent', color: devToolsTab === 'network' ? 'var(--color-feature)' : 'var(--theme-text-muted)' }}
          >
            <Globe size={10} />
            Network
            {networkLogs.length > 0 && <span className="px-1 rounded text-[9px]" style={{ backgroundColor: 'var(--theme-glass-300)' }}>{networkLogs.length}</span>}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClearLogs} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Clear">
            <Trash2 size={10} />
          </button>
          <button onClick={() => setDevToolsExpanded(!devToolsExpanded)} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title={devToolsExpanded ? 'Collapse' : 'Expand'}>
            <X size={10} className={`transition-transform ${devToolsExpanded ? '' : 'rotate-45'}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {devToolsExpanded && (
        <div ref={terminalRef} className="flex-1 h-[calc(100%-2rem)] overflow-auto p-2 font-mono text-[10px]">
          {devToolsTab === 'terminal' && (
            terminalLogs.length === 0 ? (
              <div className="text-center py-4" style={{ color: 'var(--theme-text-dim)' }}>No terminal output yet</div>
            ) : (
              <div className="space-y-0.5">
                {terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className="whitespace-pre-wrap break-all"
                    style={{
                      color: log.toLowerCase().includes('error') ? 'var(--color-error)' :
                        log.toLowerCase().includes('warn') ? 'var(--color-warning)' :
                        log.includes('ready') || log.includes('Local:') ? 'var(--color-success)' :
                        'var(--theme-text-muted)'
                    }}
                  >
                    {log}
                  </div>
                ))}
              </div>
            )
          )}
          {devToolsTab === 'console' && (
            consoleLogs.length === 0 ? (
              <div className="text-center py-4" style={{ color: 'var(--theme-text-dim)' }}>No console output yet</div>
            ) : (
              <div className="space-y-0.5">
                {consoleLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 py-0.5"
                    style={{
                      color: log.type === 'error' ? 'var(--color-error)' :
                        log.type === 'warn' ? 'var(--color-warning)' :
                        log.type === 'info' ? 'var(--color-info)' :
                        log.type === 'debug' ? 'var(--color-feature)' :
                        'var(--theme-text-muted)',
                      backgroundColor: log.type === 'error' ? 'var(--color-error-subtle)' :
                        log.type === 'warn' ? 'var(--color-warning-subtle)' : 'transparent'
                    }}
                  >
                    <span className="shrink-0" style={{ color: 'var(--theme-text-dim)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            )
          )}
          {devToolsTab === 'network' && (
            networkLogs.length === 0 ? (
              <div className="text-center py-4" style={{ color: 'var(--theme-text-dim)' }}>No network requests yet</div>
            ) : (
              <table className="w-full text-left">
                <thead style={{ color: 'var(--theme-text-muted)', borderBottom: '1px solid var(--theme-border-light)' }}>
                  <tr>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2">Method</th>
                    <th className="py-1 pr-2">URL</th>
                    <th className="py-1 pr-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {networkLogs.map((req) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
                      <td className="py-1 pr-2" style={{ color: req.status >= 400 ? 'var(--color-error)' : req.status >= 300 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        {req.status || 'ERR'}
                      </td>
                      <td className="py-1 pr-2" style={{ color: 'var(--color-info)' }}>{req.method}</td>
                      <td className="py-1 pr-2 truncate max-w-[200px]" style={{ color: 'var(--theme-text-muted)' }} title={req.url}>{req.url}</td>
                      <td className="py-1 text-right" style={{ color: 'var(--theme-text-dim)' }}>{req.duration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex-none p-2" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-200)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} style={{ color: 'var(--color-success)' }} />
            <span className="font-medium text-xs">Run Mode</span>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={fetchStatus} className="p-1.5 rounded transition-colors" style={{ color: 'var(--theme-text-muted)' }} title="Refresh status">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!isRunning ? (
          /* Not Running */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
                <Play size={32} style={{ color: 'var(--color-success)' }} />
              </div>
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>Ready to Run</h3>
              <p className="text-xs mb-6 max-w-xs" style={{ color: 'var(--theme-text-muted)' }}>
                Start the dev server to see your app running with full npm dependencies and hot reload.
              </p>
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Start Dev Server
              </button>
              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Show DevTools if there are logs from previous run (to see errors) */}
            {(terminalLogs.length > 0 || consoleLogs.length > 0) && <DevToolsPanel />}
          </div>
        ) : isServerReady ? (
          /* Server Running */
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Preview Toolbar */}
            <div className="flex-none flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>{status.url}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                  <button onClick={() => setDeviceType('desktop')} className="p-1 rounded" style={{ backgroundColor: deviceType === 'desktop' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'desktop' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Desktop">
                    <Monitor size={12} />
                  </button>
                  <button onClick={() => setDeviceType('tablet')} className="p-1 rounded" style={{ backgroundColor: deviceType === 'tablet' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'tablet' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Tablet">
                    <Tablet size={12} />
                  </button>
                  <button onClick={() => setDeviceType('mobile')} className="p-1 rounded" style={{ backgroundColor: deviceType === 'mobile' ? 'var(--theme-glass-300)' : 'transparent', color: deviceType === 'mobile' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)' }} title="Mobile">
                    <Smartphone size={12} />
                  </button>
                </div>
                <button onClick={handleRefreshIframe} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Refresh">
                  <RefreshCw size={12} />
                </button>
                <button onClick={() => setIsFullscreen(true)} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Fullscreen">
                  <Maximize2 size={12} />
                </button>
                <a href={status.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Open in new tab">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Iframe Container */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
              <div
                className="bg-white rounded shadow-lg overflow-hidden transition-all duration-200"
                style={{
                  width: deviceType === 'desktop' ? '100%' : DEVICE_SIZES[deviceType].width,
                  height: deviceType === 'desktop' ? '100%' : DEVICE_SIZES[deviceType].height,
                  maxWidth: '100%',
                  maxHeight: '100%'
                }}
              >
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={status.url}
                  className="w-full h-full border-0"
                  title="Running App Preview"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                />
              </div>
            </div>

            {/* DevTools Panel */}
            <DevToolsPanel />

            {/* Controls Footer */}
            <div className="flex-none flex items-center justify-between px-2 py-1.5" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                Stop Server
              </button>
              <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>Port: {status.port}</span>
            </div>
          </div>
        ) : (
          /* Installing/Starting */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-info)' }} />
              </div>
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                {status?.status === 'installing' ? 'Installing Dependencies...' : 'Starting Server...'}
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                {status?.status === 'installing' ? 'Running npm install' : 'Starting vite dev server...'}
              </p>
              {status?.url && (
                <span className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>{status.url}</span>
              )}
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}
              >
                <Square size={12} />
                Cancel
              </button>
            </div>

            {/* DevTools during install/start */}
            <DevToolsPanel />

            {error && (
              <div className="px-4 py-2 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', borderTop: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stop All Footer */}
      <div className="flex-none p-1.5 flex items-center justify-end" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
        <button
          onClick={handleStopAll}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors"
          style={{ color: 'var(--theme-text-muted)' }}
          title="Stop all running servers"
        >
          <StopCircle size={10} />
          Stop All Servers
        </button>
      </div>

      {/* Fullscreen Preview Modal */}
      {isFullscreen && isServerReady && <FullscreenPreview />}
    </div>
  );
};

export default RunnerPanel;
