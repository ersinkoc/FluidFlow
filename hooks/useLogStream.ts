/**
 * useLogStream - SSE-based real-time log streaming for RunnerPanel
 *
 * Features:
 * - Server-Sent Events for real-time log updates
 * - Automatic reconnection on disconnect
 * - Status tracking (connected/disconnected)
 * - Initial log catch-up on connect
 * - Batched updates to prevent excessive re-renders
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface LogEntry {
  entry: string;
  isError: boolean;
  timestamp: number;
}

interface UseLogStreamOptions {
  projectId: string | null;
  enabled: boolean;
  onStatusChange?: (status: string) => void;
}

interface UseLogStreamReturn {
  logs: string[];
  connected: boolean;
  status: string;
  clearLogs: () => void;
}

// Batch interval for log updates (ms)
const BATCH_INTERVAL = 250;
// Max logs to keep in memory
const MAX_LOGS = 500;

export function useLogStream({
  projectId,
  enabled,
  onStatusChange
}: UseLogStreamOptions): UseLogStreamReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>('stopped');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch buffer for incoming logs
  const logBufferRef = useRef<string[]>([]);
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush batched logs to state
  const flushLogs = useCallback(() => {
    if (logBufferRef.current.length > 0) {
      const newLogs = logBufferRef.current;
      logBufferRef.current = [];
      setLogs(prev => {
        const combined = [...prev, ...newLogs];
        // Keep only last MAX_LOGS entries
        return combined.length > MAX_LOGS ? combined.slice(-MAX_LOGS) : combined;
      });
    }
    batchTimeoutRef.current = null;
  }, []);

  // Add log to batch buffer
  const addLog = useCallback((entry: string) => {
    logBufferRef.current.push(entry);

    // Schedule flush if not already scheduled
    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(flushLogs, BATCH_INTERVAL);
    }
  }, [flushLogs]);

  const clearLogs = useCallback(() => {
    logBufferRef.current = [];
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    setLogs([]);
  }, []);

  useEffect(() => {
    if (!projectId || !enabled) {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
      setConnected(false);
      return;
    }

    // Create SSE connection
    const connect = () => {
      const es = new EventSource(`/api/runner/${projectId}/logs/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'init':
              // Initial catch-up logs - set directly, no batching
              setLogs((data.logs || []).slice(-MAX_LOGS));
              if (data.status) {
                setStatus(data.status);
                onStatusChange?.(data.status);
              }
              break;

            case 'log':
              // New log entry - add to batch
              addLog(data.entry);
              break;

            case 'status':
              // Status change
              setStatus(data.status);
              onStatusChange?.(data.status);

              // If stopped, close connection
              if (data.status === 'stopped') {
                es.close();
                setConnected(false);
              }
              break;
          }
        } catch (err) {
          console.error('[LogStream] Failed to parse message:', err);
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();

        // Try to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (enabled && projectId) {
            connect();
          }
        }, 3000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      setConnected(false);
    };
  }, [projectId, enabled, onStatusChange, addLog]);

  return {
    logs,
    connected,
    status,
    clearLogs
  };
}

export default useLogStream;
