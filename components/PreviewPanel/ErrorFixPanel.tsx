/**
 * ErrorFixPanel - UI for monitoring the agentic error fixing process
 *
 * Displays:
 * - Agent state (idle, analyzing, fixing, etc.)
 * - Log entries (prompts sent, responses received, fixes applied)
 * - Controls (start, stop)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Play,
  Square,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Send,
  MessageSquare,
  Wrench,
  Info,
  AlertCircle,
  Clock,
  FileCode,
  Undo2
} from 'lucide-react';
import { AgentState, AgentLogEntry, errorFixAgent, AgentConfig } from '../../services/errorFixAgent';
import { FileSystem } from '../../types';

interface ErrorFixPanelProps {
  files: FileSystem;
  currentError: string | null;
  currentErrorStack?: string;
  targetFile: string;
  onFileUpdate: (path: string, content: string) => void;
  onFixComplete?: (success: boolean) => void;
  // Revert to last working state (undo)
  onUndo?: () => void;
  canUndo?: boolean;
}

// State colors and icons
const stateConfig: Record<AgentState, { color: string; icon: React.ReactNode; label: string }> = {
  idle: { color: 'text-gray-400', icon: <Bot className="w-4 h-4" />, label: 'Idle' },
  analyzing: { color: 'text-blue-400', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Analyzing' },
  'local-fix': { color: 'text-cyan-400', icon: <Wrench className="w-4 h-4 animate-pulse" />, label: 'Local Fix' },
  'ai-fix': { color: 'text-indigo-400', icon: <Bot className="w-4 h-4 animate-pulse" />, label: 'AI Fix' },
  fixing: { color: 'text-yellow-400', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Fixing' },
  applying: { color: 'text-orange-400', icon: <Wrench className="w-4 h-4" />, label: 'Applying' },
  verifying: { color: 'text-purple-400', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Verifying' },
  success: { color: 'text-green-400', icon: <CheckCircle className="w-4 h-4" />, label: 'Success' },
  failed: { color: 'text-red-400', icon: <XCircle className="w-4 h-4" />, label: 'Failed' },
  max_attempts_reached: { color: 'text-orange-400', icon: <AlertTriangle className="w-4 h-4" />, label: 'Max Attempts' }
};

// Log entry type icons
const logTypeIcons: Record<AgentLogEntry['type'], React.ReactNode> = {
  info: <Info className="w-3.5 h-3.5 text-blue-400" />,
  prompt: <Send className="w-3.5 h-3.5 text-cyan-400" />,
  response: <MessageSquare className="w-3.5 h-3.5 text-green-400" />,
  fix: <Wrench className="w-3.5 h-3.5 text-yellow-400" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
};

export const ErrorFixPanel: React.FC<ErrorFixPanelProps> = ({
  files,
  currentError,
  currentErrorStack,
  targetFile,
  onFileUpdate,
  onFixComplete,
  onUndo,
  canUndo
}) => {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Restore state from agent on mount (handles tab switching)
  // We intentionally only run on mount to restore state, callbacks are passed by ref
  useEffect(() => {
    // Check if agent has stored state to restore
    const agentIsRunning = errorFixAgent.getIsRunning();
    const storedLogs = errorFixAgent.getLogs();
    const storedState = errorFixAgent.getState();
    const storedCompletionMessage = errorFixAgent.getCompletionMessage();
    const storedMaxAttempts = errorFixAgent.getMaxAttempts();

    // Restore state if there's something to restore
    if (storedLogs.length > 0 || storedState !== 'idle') {
      setLogs(storedLogs);
      setAgentState(storedState);
      setIsRunning(agentIsRunning);
      setCompletionMessage(storedCompletionMessage);
      setMaxAttempts(storedMaxAttempts);

      // Reconnect callbacks if agent is still running
      if (agentIsRunning) {
        errorFixAgent.reconnect({
          onStateChange: setAgentState,
          onLog: (entry) => setLogs(prev => [...prev, entry]),
          onFileUpdate,
          onComplete: (success, message) => {
            setIsRunning(false);
            setCompletionMessage(message);
            onFixComplete?.(success);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount to restore state

  // Auto-scroll to latest log (only when logs exist, and use block: 'nearest' to prevent parent scroll)
  useEffect(() => {
    if (logs.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs]);

  const handleStart = () => {
    if (!currentError) return;

    setLogs([]);
    setCompletionMessage(null);
    setIsRunning(true);

    const config: AgentConfig = {
      maxAttempts,
      timeoutMs: 60000,
      onStateChange: (state) => setAgentState(state),
      onLog: (entry) => setLogs(prev => [...prev, entry]),
      onFileUpdate: (path, content) => {
        onFileUpdate(path, content);
      },
      onComplete: (success, message) => {
        setIsRunning(false);
        setCompletionMessage(message);
        onFixComplete?.(success);
      }
    };

    errorFixAgent.start(
      currentError,
      currentErrorStack,
      targetFile,
      files,
      config
    );
  };

  const handleStop = () => {
    errorFixAgent.stop();
    setIsRunning(false);
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const stateInfo = stateConfig[agentState];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0d1117] text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-[#161b22]">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-blue-400" />
          <span className="font-medium">Error Fix Agent</span>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${stateInfo.color} bg-gray-800`}>
            {stateInfo.icon}
            <span>{stateInfo.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Max attempts selector */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Max attempts:</span>
            <select
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              disabled={isRunning}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>

          {/* Revert button - undo last change */}
          {onUndo && canUndo && currentError && !isRunning && (
            <button
              onClick={onUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-sm font-medium transition-colors"
              title="Revert to last working code"
            >
              <Undo2 className="w-4 h-4" />
              Revert
            </button>
          )}

          {/* Start/Stop button */}
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={!currentError}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Current error display */}
      {currentError && (
        <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-red-400 font-medium">Current Error</div>
              <div className="text-sm text-red-300 font-mono break-words">{currentError}</div>
              {targetFile && (
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <FileCode className="w-3 h-3" />
                  <span>{targetFile}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logs area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Bot className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">No logs yet</p>
            <p className="text-xs mt-1">Click "Start" to begin fixing the error</p>
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            const isLongContent = log.content.length > 200;

            return (
              <div
                key={log.id}
                className={`rounded border ${
                  log.type === 'error' ? 'border-red-800/50 bg-red-900/10' :
                  log.type === 'success' ? 'border-green-800/50 bg-green-900/10' :
                  log.type === 'warning' ? 'border-orange-800/50 bg-orange-900/10' :
                  'border-gray-700/50 bg-gray-800/30'
                }`}
              >
                {/* Log header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
                  onClick={() => isLongContent && toggleLogExpand(log.id)}
                >
                  {isLongContent && (
                    isExpanded ?
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> :
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  {logTypeIcons[log.type]}
                  <span className="text-sm font-medium flex-1">{log.title}</span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {log.metadata?.attempt && (
                      <span className="px-1.5 py-0.5 bg-gray-700/50 rounded">
                        #{log.metadata.attempt}
                      </span>
                    )}
                    {log.metadata?.model && (
                      <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                        {log.metadata.model}
                      </span>
                    )}
                    {log.metadata?.duration && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {(log.metadata.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span>{formatTime(log.timestamp)}</span>
                  </div>
                </div>

                {/* Log content */}
                <div className={`px-3 pb-2 ${isLongContent && !isExpanded ? 'max-h-24 overflow-hidden' : ''}`}>
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words bg-black/20 p-2 rounded">
                    {isLongContent && !isExpanded
                      ? log.content.slice(0, 200) + '...'
                      : log.content
                    }
                  </pre>
                  {log.metadata?.file && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                      <FileCode className="w-3 h-3" />
                      <span>{log.metadata.file}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Completion message */}
      {completionMessage && (
        <div className={`px-4 py-3 border-t ${
          agentState === 'success' ? 'bg-green-900/20 border-green-800/30' : 'bg-red-900/20 border-red-800/30'
        }`}>
          <div className="flex items-center gap-2">
            {agentState === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={`text-sm font-medium ${
              agentState === 'success' ? 'text-green-400' : 'text-red-400'
            }`}>
              {completionMessage}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorFixPanel;
