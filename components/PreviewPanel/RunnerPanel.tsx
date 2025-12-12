import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  ExternalLink,
  Loader2,
  Terminal,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  X,
  StopCircle
} from 'lucide-react';
import { runnerApi, RunningProjectInfo } from '@/services/projectApi';

interface RunnerPanelProps {
  projectId: string | null;
  projectName?: string;
  hasCommittedFiles: boolean; // Only allow running if files are committed
}

export const RunnerPanel: React.FC<RunnerPanelProps> = ({
  projectId,
  projectName: _projectName,
  hasCommittedFiles
}) => {
  const [status, setStatus] = useState<RunningProjectInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    if (!projectId) return;

    try {
      const result = await runnerApi.status(projectId);
      setStatus(result);

      // If running, also fetch logs
      if (result.running && showLogs) {
        const logsResult = await runnerApi.logs(projectId);
        setLogs(logsResult.logs);
      }
    } catch (_err) {
      // Not running is not an error
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
    }
  }, [projectId, showLogs]);

  // Poll for status when running
  useEffect(() => {
    fetchStatus();

    // Start polling if potentially running
    pollRef.current = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchStatus]);

  // Auto-scroll logs - scroll container, not page
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showLogs && logsContainerRef.current) {
      // Scroll the container to bottom, not the page
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  // Lock body scroll when modal is open - preserve scroll position
  useEffect(() => {
    if (showLogs) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
    };
  }, [showLogs]);

  // Start project
  const handleStart = async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await runnerApi.start(projectId);
      setStatus({
        projectId,
        port: result.port,
        url: result.url,
        status: result.status as any,
        startedAt: Date.now(),
        running: true
      });

      // Increase poll frequency during startup
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchStatus, 1000);

      // Return to normal after 30s
      setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(fetchStatus, 3000);
      }, 30000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start project');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop project
  const handleStop = async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      await runnerApi.stop(projectId);
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
      setLogs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop project');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear logs
  const handleClearLogs = () => {
    setLogs([]);
  };

  // Stop all servers
  const handleStopAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await runnerApi.stopAll();
      setStatus({ status: 'stopped', running: false } as RunningProjectInfo);
      setLogs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop servers');
    } finally {
      setIsLoading(false);
    }
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

  if (!projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500">
        <Terminal size={48} className="mb-4 opacity-50" />
        <p className="text-sm">No project selected</p>
        <p className="text-xs text-slate-600 mt-1">Select a project to run it in development mode</p>
      </div>
    );
  }

  if (!hasCommittedFiles) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle size={48} className="mb-4 text-yellow-400 opacity-70" />
        <p className="text-sm text-slate-400">Commit your changes first</p>
        <p className="text-xs text-slate-500 mt-2">
          Projects must be committed to run in development mode.
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Go to Git tab → Initialize Git → Commit your files
        </p>
      </div>
    );
  }

  const isRunning = status?.running || status?.status === 'installing' || status?.status === 'starting';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex-none p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-emerald-400" />
            <span className="font-medium text-sm">Run Mode</span>
            {getStatusBadge()}
          </div>
          <button
            onClick={fetchStatus}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors"
            title="Refresh status"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Start Dev Server
            </button>
          ) : (
            <>
              <button
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Square size={16} />
                )}
                Stop
              </button>
              {status?.url && status.status === 'running' && (
                <a
                  href={status.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors"
                >
                  <ExternalLink size={16} />
                  Open ({status.port})
                </a>
              )}
            </>
          )}
        </div>

        {/* URL display */}
        {status?.url && isRunning && (
          <div className="mt-2 px-2 py-1.5 bg-slate-800/50 rounded text-xs font-mono text-slate-400 truncate">
            {status.url}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Logs button */}
      <div className="flex-none p-3 border-t border-white/10">
        <button
          onClick={() => setShowLogs(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white rounded-lg text-sm transition-colors"
        >
          <Terminal size={14} />
          <span>View Logs</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* Info footer */}
      <div className="flex-none p-2 border-t border-white/10 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          Port range: 3300-3399
        </span>
        <button
          onClick={handleStopAll}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title="Stop all running servers"
        >
          <StopCircle size={10} />
          Stop All
        </button>
      </div>

      {/* Logs Modal */}
      {showLogs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-hidden"
          onClick={() => setShowLogs(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex-none flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-emerald-400" />
                <span className="font-medium">Dev Server Logs</span>
                {logs.length > 0 && (
                  <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
                    {logs.length} entries
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div
              ref={logsContainerRef}
              className="flex-1 overflow-auto p-4 bg-slate-950/50 font-mono text-xs"
            >
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-8">
                  <Terminal size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No logs yet</p>
                  <p className="text-slate-700 mt-1">Logs will appear here when the dev server runs</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-all py-0.5 ${
                        log.includes('error') || log.includes('Error')
                          ? 'text-red-400'
                          : log.includes('warn') || log.includes('Warning')
                          ? 'text-yellow-400'
                          : log.includes('ready') || log.includes('Local:')
                          ? 'text-green-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RunnerPanel;
