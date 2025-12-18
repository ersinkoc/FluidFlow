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

  // Determine effective project ID (use '_temp' for VFS-only runs)
  const effectiveProjectId = projectId || (files && Object.keys(files).length > 0 ? '_temp' : null);

  const isRunning = status?.running || status?.status === 'installing' || status?.status === 'starting';
  const isServerReady = status?.status === 'running' && status?.url;

  // SSE-based log streaming
  const { logs: terminalLogs, connected: sseConnected, clearLogs: clearTerminalLogs } = useLogStream({
    projectId: effectiveProjectId,
    enabled: isRunning,
    onStatusChange: (newStatus) => {
      if (newStatus === 'stopped') {
        setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
      }
    }
  });

  // Listen for postMessage from iframe (console/network)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;

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

  useEffect(() => {
    // Only scroll if new logs were added (not on every render)
    if (terminalLogs.length === lastLogCountRef.current) return;
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
          <span className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">
            <Loader2 size={12} className="animate-spin" />
            Installing...
          </span>
        );
      case 'starting':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs">
            <Loader2 size={12} className="animate-spin" />
            Starting...
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
            <CheckCircle2 size={12} />
            Running
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
            <XCircle size={12} />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-500/20 text-slate-400 rounded-full text-xs">
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
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500">
        <Terminal size={48} className="mb-4 opacity-50" />
        <p className="text-sm">No project or files to run</p>
        <p className="text-xs text-slate-600 mt-1">Create or open a project to run it in development mode</p>
      </div>
    );
  }

  // Fullscreen Preview Modal
  const FullscreenPreview = () => (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950"
      onClick={() => setIsFullscreen(false)}
    >
      <div
        className="flex-none flex items-center justify-between p-3 border-b border-white/10 bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-emerald-400">Running App</span>
          {status?.url && (
            <span className="px-2 py-0.5 bg-slate-800 rounded text-xs font-mono text-slate-400">
              {status.url}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button onClick={() => setDeviceType('desktop')} className={`p-1.5 rounded ${deviceType === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="Desktop">
              <Monitor size={14} />
            </button>
            <button onClick={() => setDeviceType('tablet')} className={`p-1.5 rounded ${deviceType === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="Tablet">
              <Tablet size={14} />
            </button>
            <button onClick={() => setDeviceType('mobile')} className={`p-1.5 rounded ${deviceType === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="Mobile">
              <Smartphone size={14} />
            </button>
          </div>
          <button onClick={handleRefreshIframe} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <a href={status?.url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white" title="Open in new tab">
            <ExternalLink size={14} />
          </a>
          <button onClick={() => setIsFullscreen(false)} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white" title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#1a1a2e] p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  );

  // DevTools Panel Component
  const DevToolsPanel = () => (
    <div className={`flex-none border-t border-white/10 bg-slate-900/80 ${devToolsExpanded ? 'h-48' : 'h-8'} transition-all`}>
      {/* Tabs */}
      <div className="flex items-center justify-between h-8 px-2 border-b border-white/5">
        <div className="flex items-center gap-1">
          {/* Tab buttons */}
          <button
            onClick={() => { setDevToolsTab('terminal'); setDevToolsExpanded(true); }}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded ${devToolsTab === 'terminal' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Terminal size={10} />
            Terminal
            {terminalLogs.length > 0 && <span className="px-1 bg-slate-700 rounded text-[9px]">{terminalLogs.length}</span>}
            {sseConnected && <Wifi size={8} className="text-green-400" />}
            {!sseConnected && isRunning && <WifiOff size={8} className="text-red-400" />}
          </button>
          <button
            onClick={() => { setDevToolsTab('console'); setDevToolsExpanded(true); }}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded ${devToolsTab === 'console' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <AlertCircle size={10} />
            Console
            {consoleLogs.length > 0 && (
              <span className={`px-1 rounded text-[9px] ${errorCount > 0 ? 'bg-red-500/30 text-red-400' : warnCount > 0 ? 'bg-yellow-500/30 text-yellow-400' : 'bg-slate-700'}`}>
                {consoleLogs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setDevToolsTab('network'); setDevToolsExpanded(true); }}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded ${devToolsTab === 'network' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Globe size={10} />
            Network
            {networkLogs.length > 0 && <span className="px-1 bg-slate-700 rounded text-[9px]">{networkLogs.length}</span>}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClearLogs} className="p-1 text-slate-500 hover:text-white hover:bg-white/5 rounded" title="Clear">
            <Trash2 size={10} />
          </button>
          <button onClick={() => setDevToolsExpanded(!devToolsExpanded)} className="p-1 text-slate-500 hover:text-white hover:bg-white/5 rounded" title={devToolsExpanded ? 'Collapse' : 'Expand'}>
            <X size={10} className={`transition-transform ${devToolsExpanded ? '' : 'rotate-45'}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {devToolsExpanded && (
        <div ref={terminalRef} className="flex-1 h-[calc(100%-2rem)] overflow-auto p-2 font-mono text-[10px]">
          {devToolsTab === 'terminal' && (
            terminalLogs.length === 0 ? (
              <div className="text-slate-600 text-center py-4">No terminal output yet</div>
            ) : (
              <div className="space-y-0.5">
                {terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap break-all ${
                      log.toLowerCase().includes('error') ? 'text-red-400' :
                      log.toLowerCase().includes('warn') ? 'text-yellow-400' :
                      log.includes('ready') || log.includes('Local:') ? 'text-green-400' :
                      'text-slate-400'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            )
          )}
          {devToolsTab === 'console' && (
            consoleLogs.length === 0 ? (
              <div className="text-slate-600 text-center py-4">No console output yet</div>
            ) : (
              <div className="space-y-0.5">
                {consoleLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-0.5 ${
                      log.type === 'error' ? 'text-red-400 bg-red-500/5' :
                      log.type === 'warn' ? 'text-yellow-400 bg-yellow-500/5' :
                      log.type === 'info' ? 'text-blue-400' :
                      log.type === 'debug' ? 'text-purple-400' :
                      'text-slate-400'
                    }`}
                  >
                    <span className="text-slate-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            )
          )}
          {devToolsTab === 'network' && (
            networkLogs.length === 0 ? (
              <div className="text-slate-600 text-center py-4">No network requests yet</div>
            ) : (
              <table className="w-full text-left">
                <thead className="text-slate-500 border-b border-white/5">
                  <tr>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2">Method</th>
                    <th className="py-1 pr-2">URL</th>
                    <th className="py-1 pr-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {networkLogs.map((req) => (
                    <tr key={req.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className={`py-1 pr-2 ${req.status >= 400 ? 'text-red-400' : req.status >= 300 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {req.status || 'ERR'}
                      </td>
                      <td className="py-1 pr-2 text-blue-400">{req.method}</td>
                      <td className="py-1 pr-2 text-slate-400 truncate max-w-[200px]" title={req.url}>{req.url}</td>
                      <td className="py-1 text-right text-slate-500">{req.duration}ms</td>
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
      <div className="flex-none p-2 border-b border-white/10 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-emerald-400" />
            <span className="font-medium text-xs">Run Mode</span>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={fetchStatus} className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors" title="Refresh status">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!isRunning ? (
          /* Not Running */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <Play size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-sm font-medium text-white mb-2">Ready to Run</h3>
            <p className="text-xs text-slate-500 mb-6 max-w-xs">
              Start the dev server to see your app running with full npm dependencies and hot reload.
            </p>
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Start Dev Server
            </button>
            {error && (
              <div className="mt-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        ) : isServerReady ? (
          /* Server Running */
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Preview Toolbar */}
            <div className="flex-none flex items-center justify-between px-2 py-1.5 border-b border-white/5 bg-slate-900/30">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-mono">{status.url}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 bg-slate-800/50 rounded p-0.5">
                  <button onClick={() => setDeviceType('desktop')} className={`p-1 rounded ${deviceType === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`} title="Desktop">
                    <Monitor size={12} />
                  </button>
                  <button onClick={() => setDeviceType('tablet')} className={`p-1 rounded ${deviceType === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`} title="Tablet">
                    <Tablet size={12} />
                  </button>
                  <button onClick={() => setDeviceType('mobile')} className={`p-1 rounded ${deviceType === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`} title="Mobile">
                    <Smartphone size={12} />
                  </button>
                </div>
                <button onClick={handleRefreshIframe} className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-white" title="Refresh">
                  <RefreshCw size={12} />
                </button>
                <button onClick={() => setIsFullscreen(true)} className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-white" title="Fullscreen">
                  <Maximize2 size={12} />
                </button>
                <a href={status.url} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-white" title="Open in new tab">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Iframe Container */}
            <div className="flex-1 min-h-0 bg-[#1a1a2e] flex items-center justify-center p-2 overflow-hidden">
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
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>
            </div>

            {/* DevTools Panel */}
            <DevToolsPanel />

            {/* Controls Footer */}
            <div className="flex-none flex items-center justify-between px-2 py-1.5 border-t border-white/5 bg-slate-900/30">
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-medium transition-colors"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                Stop Server
              </button>
              <span className="text-[10px] text-slate-600">Port: {status.port}</span>
            </div>
          </div>
        ) : (
          /* Installing/Starting */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                <Loader2 size={32} className="text-blue-400 animate-spin" />
              </div>
              <h3 className="text-sm font-medium text-white mb-2">
                {status?.status === 'installing' ? 'Installing Dependencies...' : 'Starting Server...'}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                {status?.status === 'installing' ? 'Running npm install' : 'Starting vite dev server...'}
              </p>
              {status?.url && (
                <span className="px-2 py-1 bg-slate-800 rounded text-xs font-mono text-slate-400">{status.url}</span>
              )}
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-medium transition-colors"
              >
                <Square size={12} />
                Cancel
              </button>
            </div>

            {/* DevTools during install/start */}
            <DevToolsPanel />

            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stop All Footer */}
      <div className="flex-none p-1.5 border-t border-white/5 flex items-center justify-end bg-slate-950/50">
        <button
          onClick={handleStopAll}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
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
