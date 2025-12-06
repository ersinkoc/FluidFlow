import React, { useRef, useEffect } from 'react';
import { Terminal, ChevronUp, ChevronDown, Trash2, Wifi, Check, Loader2, Sparkles } from 'lucide-react';
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

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  networkLogs,
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  onClearLogs,
  onClearNetwork,
  onFixError
}) => {
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
      className={`absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 transition-[height] duration-300 ease-out flex flex-col shadow-2xl z-40 ${
        isOpen ? 'h-48' : 'h-8'
      }`}
      style={{ position: 'absolute' }}
    >
      {/* Console Header */}
      <div
        onClick={onToggle}
        className="h-8 bg-slate-950 hover:bg-slate-900 cursor-pointer flex items-center justify-between px-4 border-b border-white/5 select-none transition-colors"
        role="button"
        aria-expanded={isOpen}
        aria-label="Toggle DevTools panel"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Terminal className="w-3 h-3 text-blue-400" />
            <span className="font-semibold text-slate-300">DevTools</span>
          </div>

          {isOpen && (
            <div
              className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onTabChange('console')}
                className={`px-3 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeTab === 'console'
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Console {logs.length > 0 && `(${logs.length})`}
              </button>
              <button
                onClick={() => onTabChange('network')}
                className={`px-3 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeTab === 'network'
                    ? 'bg-emerald-600/20 text-emerald-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
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
                activeTab === 'console' ? onClearLogs() : onClearNetwork();
              }}
              className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
              title="Clear"
              aria-label={`Clear ${activeTab}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <div className="text-slate-500">
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </div>
        </div>
      </div>

      {/* Panel Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px] custom-scrollbar bg-[#0d1117]">
          {activeTab === 'console' ? (
            <div className="p-3 space-y-1.5">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 italic py-10">
                  <Terminal className="w-5 h-5 mb-2 opacity-50" />
                  <span>Console is clear</span>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex gap-3 border-b border-white/[0.03] pb-2 last:border-0 items-start group ${
                      log.type === 'error' ? 'bg-red-500/5 -mx-3 px-3 py-1' : ''
                    }`}
                  >
                    <span
                      className={`flex-none opacity-40 select-none min-w-[50px] pt-0.5 ${
                        log.type === 'error' ? 'text-red-300' : 'text-slate-500'
                      }`}
                    >
                      {log.timestamp}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`break-all whitespace-pre-wrap ${
                          log.type === 'error'
                            ? 'text-red-300 font-semibold'
                            : log.type === 'warn'
                            ? 'text-yellow-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {log.message}
                      </span>

                      {log.type === 'error' && (
                        <div className="mt-2 flex items-center gap-2">
                          {log.isFixed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 text-[10px] font-medium border border-green-500/30">
                              <Check className="w-3 h-3" />
                              Fixed
                            </span>
                          ) : (
                            <button
                              onClick={() => onFixError(log.id, log.message)}
                              disabled={log.isFixing}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/20 transition-all text-[10px] font-medium"
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
                <div className="h-full flex flex-col items-center justify-center text-slate-600 italic py-10">
                  <Wifi className="w-5 h-5 mb-2 opacity-50" />
                  <span>No network requests recorded</span>
                </div>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400">
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
                  <tbody className="divide-y divide-white/5">
                    {networkLogs.map((req) => (
                      <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              req.status === 200 || req.status === 201
                                ? 'bg-green-500/10 text-green-400'
                                : req.status === 'ERR'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-yellow-500/10 text-yellow-400'
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-300 font-bold">
                          {req.method}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400 truncate max-w-xs" title={req.url}>
                          {req.url}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-500">
                          {Math.round(req.duration)}ms
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-600 text-[10px]">
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
};
