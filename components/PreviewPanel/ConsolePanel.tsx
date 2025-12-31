import React, { useRef, useEffect, memo } from 'react';
import { Terminal, ChevronUp, ChevronDown, Trash2, Wifi, Check, Sparkles, Loader2 } from 'lucide-react';
import { LogEntry, NetworkRequest, TerminalTab } from '../../types';

interface ConsolePanelProps {
  logs: LogEntry[];
  networkLogs: NetworkRequest[];
  isOpen: boolean;
  onToggle: () => void;
  activeTab: TerminalTab;
  onTabChange: (tab: TerminalTab) => void;
  onClearLogs: () => void;
  onClearNetwork: () => void;
  onFixError: (logId: string, message: string) => void;
}

export const ConsolePanel = memo(function ConsolePanel({
  logs,
  networkLogs,
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  onClearLogs,
  onClearNetwork,
  onFixError
}: ConsolePanelProps) {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console - only scroll within the console panel, not the whole page
  useEffect(() => {
    if (isOpen && activeTab === 'console' && consoleEndRef.current) {
      const container = consoleEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [logs, isOpen, activeTab]);

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 transition-[height] duration-300 ease-out flex flex-col shadow-2xl z-40 ${
        isOpen ? 'h-48' : 'h-8'
      }`}
      style={{
        position: 'absolute',
        backgroundColor: 'var(--theme-surface)',
        borderTop: '1px solid var(--theme-border)'
      }}
    >
      {/* Console Header */}
      <div
        onClick={onToggle}
        className="h-8 cursor-pointer flex items-center justify-between px-4 select-none transition-colors"
        style={{
          backgroundColor: 'var(--theme-surface-elevated)',
          borderBottom: '1px solid var(--theme-border-light)'
        }}
        role="button"
        aria-expanded={isOpen}
        aria-label="Toggle DevTools panel"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--theme-text-secondary)' }}>
            <Terminal className="w-3 h-3" style={{ color: 'var(--theme-accent)' }} />
            <span className="font-semibold" style={{ color: 'var(--theme-text-primary)' }}>DevTools</span>
          </div>

          {isOpen && (
            <div
              className="flex items-center gap-1 p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onTabChange('console')}
                className="px-3 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: activeTab === 'console' ? 'var(--theme-accent-subtle)' : 'transparent',
                  color: activeTab === 'console' ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                }}
              >
                Console {logs.length > 0 && `(${logs.length})`}
              </button>
              <button
                onClick={() => onTabChange('network')}
                className="px-3 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: activeTab === 'network' ? 'var(--color-success-subtle)' : 'transparent',
                  color: activeTab === 'network' ? 'var(--color-success)' : 'var(--theme-text-muted)'
                }}
              >
                Network {networkLogs.length > 0 && `(${networkLogs.length})`}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (activeTab === 'console') { onClearLogs(); } else { onClearNetwork(); }
              }}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Clear"
              aria-label={`Clear ${activeTab}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <div style={{ color: 'var(--theme-text-muted)' }}>
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </div>
        </div>
      </div>

      {/* Panel Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px] custom-scrollbar" style={{ backgroundColor: 'var(--theme-code-bg)' }}>
          {activeTab === 'console' ? (
            <div className="p-3 space-y-1.5">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center italic py-10" style={{ color: 'var(--theme-text-muted)' }}>
                  <Terminal className="w-5 h-5 mb-2 opacity-50" />
                  <span>Console is clear</span>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-3 pb-2 last:border-0 items-start group"
                    style={{
                      borderBottom: '1px solid var(--theme-border-light)',
                      backgroundColor: log.type === 'error' ? 'var(--color-error-subtle)' : 'transparent',
                      margin: log.type === 'error' ? '0 -12px' : undefined,
                      padding: log.type === 'error' ? '4px 12px' : undefined
                    }}
                  >
                    <span
                      className="flex-none opacity-40 select-none min-w-[50px] pt-0.5"
                      style={{ color: log.type === 'error' ? 'var(--color-error-text)' : 'var(--theme-text-muted)' }}
                    >
                      {log.timestamp}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span
                        className="break-all whitespace-pre-wrap"
                        style={{
                          color: log.type === 'error'
                            ? 'var(--color-error-text)'
                            : log.type === 'warn'
                            ? 'var(--color-warning)'
                            : 'var(--theme-text-secondary)',
                          fontWeight: log.type === 'error' ? 600 : 400
                        }}
                      >
                        {log.message}
                      </span>

                      {log.type === 'error' && (
                        <div className="mt-2 flex items-center gap-2">
                          {log.isFixed ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: 'var(--color-success-subtle)',
                                color: 'var(--color-success)',
                                border: '1px solid var(--color-success-border)'
                              }}
                            >
                              <Check className="w-3 h-3" />
                              Fixed
                            </span>
                          ) : (
                            <button
                              onClick={() => onFixError(log.id, log.message)}
                              disabled={log.isFixing}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded transition-all text-[10px] font-medium"
                              style={{
                                backgroundColor: 'var(--color-error-subtle)',
                                color: 'var(--color-error-text)',
                                border: '1px solid var(--color-error-border)'
                              }}
                            >
                              {log.isFixing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              {log.isFixing ? 'Fixing with AI...' : 'Fix with AI'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          ) : (
            <div className="min-w-full inline-block align-middle">
              {networkLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center italic py-10" style={{ color: 'var(--theme-text-muted)' }}>
                  <Wifi className="w-5 h-5 mb-2 opacity-50" />
                  <span>No network requests recorded</span>
                </div>
              ) : (
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--theme-surface-elevated)', color: 'var(--theme-text-secondary)' }}>
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium w-20">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium w-20">
                        Method
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Name
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium w-24">
                        Time
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium w-24">
                        Timestamp
                      </th>
                    </tr>
                  </thead>
                  <tbody style={{ borderColor: 'var(--theme-border-light)' }}>
                    {networkLogs.map((req) => (
                      <tr key={req.id} className="transition-colors" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: req.status === 200 || req.status === 201
                                ? 'var(--color-success-subtle)'
                                : req.status === 'ERR'
                                ? 'var(--color-error-subtle)'
                                : 'var(--color-warning-subtle)',
                              color: req.status === 200 || req.status === 201
                                ? 'var(--color-success)'
                                : req.status === 'ERR'
                                ? 'var(--color-error)'
                                : 'var(--color-warning)'
                            }}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap font-bold" style={{ color: 'var(--theme-text-primary)' }}>
                          {req.method}
                        </td>
                        <td className="px-3 py-1.5 truncate max-w-xs" style={{ color: 'var(--theme-text-secondary)' }} title={req.url}>
                          {req.url}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right" style={{ color: 'var(--theme-text-muted)' }}>
                          {Math.round(req.duration)}ms
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                          {req.timestamp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
