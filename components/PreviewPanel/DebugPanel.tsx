import React, { useState, useMemo } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  Bug,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Filter,
  Clock,
  Zap,
  AlertCircle,
  MessageSquare,
  ArrowUpCircle,
  ArrowDownCircle,
  Radio,
  Info,
  X,
  Eye,
  EyeOff,
  Wrench,
} from 'lucide-react';
import { useDebugStore } from '@/hooks/useDebugStore';
import type { DebugLogEntry } from '@/types';

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
  depth?: number;
}

function JsonViewer({ data, collapsed = false, depth = 0 }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed || depth > 2);

  if (data === null) return <span style={{ color: 'var(--color-warning)' }}>null</span>;
  if (data === undefined) return <span style={{ color: 'var(--theme-text-dim)' }}>undefined</span>;
  if (typeof data === 'boolean') return <span style={{ color: 'var(--color-feature)' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: 'var(--color-info)' }}>{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 500) {
      return (
        <span style={{ color: 'var(--color-success)' }}>
          "{data.slice(0, 500)}
          <span style={{ color: 'var(--theme-text-dim)' }}>... ({data.length} chars)</span>"
        </span>
      );
    }
    return <span style={{ color: 'var(--color-success)' }}>"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--theme-text-muted)' }}>[]</span>;
    return (
      <div className="inline">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center hover:bg-white/5 rounded px-0.5"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span style={{ color: 'var(--theme-text-muted)' }}>[</span>
          {isCollapsed && <span className="text-xs ml-1" style={{ color: 'var(--theme-text-dim)' }}>{data.length} items</span>}
        </button>
        {!isCollapsed && (
          <div className="ml-4 pl-2" style={{ borderLeft: '1px solid var(--theme-border-subtle)' }}>
            {data.map((item, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-xs mr-2" style={{ color: 'var(--theme-text-dim)' }}>{i}:</span>
                <JsonViewer data={item} depth={depth + 1} />
                {i < data.length - 1 && <span style={{ color: 'var(--theme-text-dim)' }}>,</span>}
              </div>
            ))}
          </div>
        )}
        {!isCollapsed && <span style={{ color: 'var(--theme-text-muted)' }}>]</span>}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'var(--theme-text-muted)' }}>{'{}'}</span>;
    return (
      <div className="inline">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center hover:bg-white/5 rounded px-0.5"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span style={{ color: 'var(--theme-text-muted)' }}>{'{'}</span>
          {isCollapsed && <span className="text-xs ml-1" style={{ color: 'var(--theme-text-dim)' }}>{entries.length} keys</span>}
        </button>
        {!isCollapsed && (
          <div className="ml-4 pl-2" style={{ borderLeft: '1px solid var(--theme-border-subtle)' }}>
            {entries.map(([key, value], i) => (
              <div key={key} className="leading-relaxed">
                <span style={{ color: 'var(--color-info)' }}>"{key}"</span>
                <span style={{ color: 'var(--theme-text-muted)' }}>: </span>
                <JsonViewer data={value} depth={depth + 1} />
                {i < entries.length - 1 && <span style={{ color: 'var(--theme-text-dim)' }}>,</span>}
              </div>
            ))}
          </div>
        )}
        {!isCollapsed && <span style={{ color: 'var(--theme-text-muted)' }}>{'}'}</span>}
      </div>
    );
  }

  return <span style={{ color: 'var(--theme-text-muted)' }}>{String(data)}</span>;
}

// Safe JSON display component with error handling
function SafeJsonDisplay({ content }: { content: string }) {
  // Check if it looks like JSON
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return <pre className="whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{content}</pre>;
  }

  // Try to parse JSON safely
  try {
    const parsed = JSON.parse(content);
    return <JsonViewer data={parsed} />;
  } catch {
    // Show as text with warning for malformed JSON
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs mb-2 pb-2" style={{ color: 'var(--color-warning)', borderBottom: '1px solid var(--theme-border-subtle)' }}>
          <AlertCircle size={12} />
          <span>Malformed JSON (truncated or invalid)</span>
        </div>
        <pre className="whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{content}</pre>
      </div>
    );
  }
}

interface LogEntryCardProps {
  entry: DebugLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

const LogEntryCard: React.FC<LogEntryCardProps> = ({ entry, isExpanded, onToggle }) => {
  const { isCopied: copied, copy: copyText } = useCopyToClipboard();

  const typeConfig = {
    request: { icon: ArrowUpCircle, colorVar: 'var(--color-info)', bgVar: 'var(--color-info-subtle)' },
    response: { icon: ArrowDownCircle, colorVar: 'var(--color-success)', bgVar: 'var(--color-success-subtle)' },
    stream: { icon: Radio, colorVar: 'var(--color-feature)', bgVar: 'var(--color-feature-subtle)' },
    error: { icon: AlertCircle, colorVar: 'var(--color-error)', bgVar: 'var(--color-error-subtle)' },
    info: { icon: Info, colorVar: 'var(--theme-text-muted)', bgVar: 'var(--theme-glass-100)' },
    'tool-call': { icon: Wrench, colorVar: 'var(--color-warning)', bgVar: 'var(--color-warning-subtle)' },
  };

  const config = typeConfig[entry.type];
  const Icon = config.icon;

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('tr-TR', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  const copyToClipboard = () => {
    copyText(JSON.stringify(entry, null, 2));
  };

  const getPreview = () => {
    if (entry.prompt) return entry.prompt.slice(0, 100) + (entry.prompt.length > 100 ? '...' : '');
    if (entry.response) return entry.response.slice(0, 100) + (entry.response.length > 100 ? '...' : '');
    if (entry.error) return entry.error.slice(0, 100) + (entry.error.length > 100 ? '...' : '');
    return entry.category;
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: config.bgVar, border: '1px solid var(--theme-border-subtle)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-white/5 transition-colors text-left"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} style={{ color: config.colorVar }} />
        <span className="text-xs font-medium uppercase" style={{ color: config.colorVar }}>{entry.type}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--theme-text-dim)', backgroundColor: 'var(--theme-glass-100)' }}>{entry.category}</span>
        {entry.provider && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--theme-text-dim)', backgroundColor: 'var(--theme-glass-100)' }}>
            {entry.provider}
          </span>
        )}
        {entry.model && (
          <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ color: 'var(--theme-text-muted)', backgroundColor: 'var(--theme-glass-100)' }}>
            <Zap size={10} />
            {entry.model}
          </span>
        )}
        {entry.duration !== undefined && (
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
            <Clock size={10} />
            {entry.duration}ms
          </span>
        )}
        {/* Tool calling badge */}
        {entry.metadata?.toolCallingEnabled ? (
          <span
            className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
          >
            <Wrench size={10} />
            TC
            {entry.metadata?.toolCount != null ? `(${String(entry.metadata.toolCount)})` : null}
          </span>
        ) : null}
        {/* Files written badge */}
        {(entry.metadata?.filesWritten as string[])?.length > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}
          >
            <Check size={10} />
            {entry.metadata !== undefined && entry.metadata?.filesWritten != null ? String((entry.metadata.filesWritten as string[])?.length ?? 0) : null}
          </span>
        )}
        {/* Tool call badge for tool-call entries */}
        {entry.type === 'tool-call' && entry.toolCallInfo?.filesWritten ? (
          <span
            className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}
          >
            <Check size={10} />
            {entry.toolCallInfo?.filesWritten?.length} file(s)
          </span>
        ) : null}
        {/* Stream progress indicator */}
        {entry.type === 'stream' && entry.streamProgress && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${!entry.streamProgress.isComplete ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: entry.streamProgress.isComplete ? 'var(--color-success-subtle)' : 'var(--color-warning-subtle)',
              color: entry.streamProgress.isComplete ? 'var(--color-success)' : 'var(--color-warning)',
            }}
          >
            <Radio size={10} className={entry.streamProgress.isComplete ? '' : 'animate-spin'} />
            {entry.streamProgress.isComplete ? 'Complete' : 'Streaming'}
            <span style={{ color: 'var(--theme-text-muted)' }}>
              {(entry.streamProgress.chars / 1024).toFixed(1)}KB
            </span>
          </span>
        )}
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--theme-text-dim)' }}>{getPreview()}</span>
        <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>{formatTime(entry.timestamp)}</span>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--theme-border-subtle)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <div className="flex justify-end">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>

          {entry.prompt && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Prompt:</div>
              <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <pre className="whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{entry.prompt}</pre>
              </div>
            </div>
          )}

          {entry.systemInstruction && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>System Instruction:</div>
              <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <pre className="whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{entry.systemInstruction}</pre>
              </div>
            </div>
          )}

          {entry.attachments && entry.attachments.length > 0 && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Attachments:</div>
              <div className="flex flex-wrap gap-2">
                {entry.attachments.map((att, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                    {att.type} ({(att.size / 1024).toFixed(1)} KB)
                  </span>
                ))}
              </div>
            </div>
          )}

          {entry.response && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Response:</div>
              <div className="rounded p-2 text-xs font-mono overflow-auto max-h-96" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <SafeJsonDisplay content={entry.response} />
              </div>
            </div>
          )}

          {entry.error && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--color-error)' }}>Error:</div>
              <div className="rounded p-2 text-xs font-mono" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
                {entry.error}
              </div>
            </div>
          )}

          {/* Tool Call Info */}
          {entry.type === 'tool-call' && entry.toolCallInfo && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wrench size={14} style={{ color: 'var(--color-warning)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                  Tool Call: {entry.toolCallInfo.toolName}
                </span>
                {entry.toolCallInfo.success !== undefined && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: entry.toolCallInfo.success ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                      color: entry.toolCallInfo.success ? 'var(--color-success)' : 'var(--color-error)',
                    }}
                  >
                    {entry.toolCallInfo.success ? 'Success' : 'Failed'}
                  </span>
                )}
              </div>

              {entry.toolCallInfo.arguments && Object.keys(entry.toolCallInfo.arguments).length > 0 && (
                <div>
                  <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Arguments:</div>
                  <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                    <JsonViewer data={entry.toolCallInfo.arguments} />
                  </div>
                </div>
              )}

              {entry.toolCallInfo.result ? (
                <div>
                  <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Result:</div>
                  <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                    <JsonViewer data={entry.toolCallInfo.result} />
                  </div>
                </div>
              ) : null}

              {entry.toolCallInfo.filesWritten && entry.toolCallInfo.filesWritten.length > 0 && (
                <div>
                  <div className="text-xs mb-1 font-medium" style={{ color: 'var(--color-success)' }}>Files Written:</div>
                  <div className="flex flex-wrap gap-2">
                    {entry.toolCallInfo.filesWritten.map((file, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {entry.tokenCount && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium" style={{ color: 'var(--theme-text-muted)' }}>
                  Tokens{entry.tokenCount.isEstimated && <span className="ml-1" style={{ color: 'var(--color-warning)' }}>(estimated)</span>}:
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                {entry.tokenCount.input !== undefined && (
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    Input: <span style={{ color: 'var(--color-info)' }}>{entry.tokenCount.input.toLocaleString()}</span>
                  </span>
                )}
                {entry.tokenCount.output !== undefined && (
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    Output: <span style={{ color: 'var(--color-success)' }}>{entry.tokenCount.output.toLocaleString()}</span>
                  </span>
                )}
                {entry.tokenCount.input !== undefined && entry.tokenCount.output !== undefined && (
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    Total: <span style={{ color: 'var(--color-feature)' }}>{(entry.tokenCount.input + entry.tokenCount.output).toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stream progress details */}
          {entry.streamProgress !== undefined ? (
            <div className="space-y-2">
              <div className="text-xs font-medium" style={{ color: 'var(--theme-text-muted)' }}>Stream Progress:</div>
              <div className="flex gap-4 text-xs">
                <span style={{ color: 'var(--theme-text-muted)' }}>
                  Characters: <span style={{ color: 'var(--color-feature)' }}>{entry.streamProgress.chars.toLocaleString()}</span>
                </span>
                <span style={{ color: 'var(--theme-text-muted)' }}>
                  Chunks: <span style={{ color: 'var(--color-feature)' }}>{entry.streamProgress.chunks}</span>
                </span>
                <span style={{ color: 'var(--theme-text-muted)' }}>
                  Status: <span style={{ color: entry.streamProgress.isComplete ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {entry.streamProgress.isComplete ? 'Complete' : 'In Progress'}
                  </span>
                </span>
              </div>
              {/* Progress bar */}
              {entry.streamProgress.isComplete ? null : (
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                  <div
                    className="h-full animate-pulse"
                    style={{ backgroundColor: 'var(--color-feature)', width: '100%' }}
                  />
                </div>
              )}

              {/* Tool calling info */}
              {entry.metadata?.toolCallingEnabled ? (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--theme-border-subtle)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench size={12} style={{ color: 'var(--color-warning)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>Tool Calling</span>
                    {entry.metadata.toolChoice != null ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                        {String(entry.metadata.toolChoice)}
                      </span>
                    ) : null}
                  </div>
                  {entry.metadata.tools != null && (entry.metadata.tools as string[]).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>Tools:</span>
                      {(entry.metadata.tools as string[]).map((tool: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                          {tool}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {entry.metadata.filesWritten != null && (entry.metadata.filesWritten as string[]).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>Files Written:</span>
                      {(entry.metadata.filesWritten as string[]).map((file: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                          {file}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>Metadata:</div>
              <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <JsonViewer data={entry.metadata} />
              </div>
            </div>
          )}

          {/* Tool calling info for non-stream entries (request, response, etc.) */}
          {entry.metadata?.toolCallingEnabled && entry.type !== 'stream' ? (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--theme-border-subtle)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Wrench size={12} style={{ color: 'var(--color-warning)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>Tool Calling</span>
                {entry.metadata.toolCount !== undefined ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                    {String(entry.metadata.toolCount)} tools
                  </span>
                ) : null}
                {entry.metadata.toolChoice != null ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                    {String(entry.metadata.toolChoice)}
                  </span>
                ) : null}
              </div>
              {entry.metadata.filesWritten != null && (entry.metadata.filesWritten as string[]).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>Files Written:</span>
                  {(entry.metadata.filesWritten as string[]).map((file: string, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                      {file}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function DebugPanel() {
  const { enabled, filteredLogs, filter, setEnabled, clearLogs, setFilter } = useDebugStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedIds(newSet);
  };

  const stats = useMemo(() => {
    return {
      total: filteredLogs.length,
      requests: filteredLogs.filter(l => l.type === 'request').length,
      responses: filteredLogs.filter(l => l.type === 'response').length,
      errors: filteredLogs.filter(l => l.type === 'error').length,
    };
  }, [filteredLogs]);

  const typeOptions: DebugLogEntry['type'][] = ['request', 'response', 'stream', 'error', 'info', 'tool-call'];
  const categoryOptions: DebugLogEntry['category'][] = ['generation', 'accessibility', 'quick-edit', 'auto-fix', 'git-commit', 'auto-commit', 'prompt-improver', 'tool-call', 'other'];

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--theme-border-subtle)' }}>
        <div className="flex items-center gap-3">
          <Bug size={16} style={{ color: 'var(--color-feature)' }} />
          <span className="font-medium">Debug Console</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              backgroundColor: enabled ? 'var(--color-success-subtle)' : 'var(--theme-glass-100)',
              color: enabled ? 'var(--color-success)' : 'var(--theme-text-muted)',
              border: enabled ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-subtle)',
            }}
          >
            {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
            {enabled ? 'Logging Active' : 'Logging Disabled'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>{stats.requests} req</span>
            <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>{stats.responses} res</span>
            {stats.errors > 0 && (
              <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>{stats.errors} err</span>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 rounded transition-colors"
            style={{
              backgroundColor: showFilters ? 'var(--theme-glass-200)' : 'transparent',
              color: showFilters ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
            }}
          >
            <Filter size={14} />
          </button>
          <button
            onClick={clearLogs}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Clear logs"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-3 space-y-3" style={{ borderBottom: '1px solid var(--theme-border-subtle)', backgroundColor: 'var(--theme-surface-dark)' }}>
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--theme-text-dim)' }} />
            <input
              type="text"
              placeholder="Search logs..."
              value={filter.searchQuery}
              onChange={e => setFilter({ searchQuery: e.target.value })}
              className="w-full pl-9 pr-8 py-2 rounded-lg text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            />
            {filter.searchQuery && (
              <button
                onClick={() => setFilter({ searchQuery: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--theme-text-dim)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type filter */}
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>Type</div>
            <div className="flex flex-wrap gap-1.5">
              {typeOptions.map(type => (
                <button
                  key={type}
                  onClick={() => {
                    const newTypes = filter.types.includes(type)
                      ? filter.types.filter(t => t !== type)
                      : [...filter.types, type];
                    setFilter({ types: newTypes });
                  }}
                  className="px-2 py-1 text-xs rounded transition-colors"
                  style={{
                    backgroundColor: filter.types.includes(type) ? 'var(--color-feature-subtle)' : 'var(--theme-glass-100)',
                    color: filter.types.includes(type) ? 'var(--color-feature)' : 'var(--theme-text-dim)',
                    border: filter.types.includes(type) ? '1px solid var(--color-feature-border)' : '1px solid var(--theme-border-subtle)',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>Category</div>
            <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    const newCats = filter.categories.includes(cat)
                      ? filter.categories.filter(c => c !== cat)
                      : [...filter.categories, cat];
                    setFilter({ categories: newCats });
                  }}
                  className="px-2 py-1 text-xs rounded transition-colors"
                  style={{
                    backgroundColor: filter.categories.includes(cat) ? 'var(--color-feature-subtle)' : 'var(--theme-glass-100)',
                    color: filter.categories.includes(cat) ? 'var(--color-feature)' : 'var(--theme-text-dim)',
                    border: filter.categories.includes(cat) ? '1px solid var(--color-feature-border)' : '1px solid var(--theme-border-subtle)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {!enabled ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--theme-text-dim)' }}>
            <EyeOff size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Debug logging is disabled</p>
            <p className="text-sm mt-1">Enable logging to monitor API calls</p>
            <button
              onClick={() => setEnabled(true)}
              className="mt-4 px-4 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}
            >
              Enable Debug Mode
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--theme-text-dim)' }}>
            <MessageSquare size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">No logs yet</p>
            <p className="text-sm mt-1">API calls will appear here</p>
          </div>
        ) : (
          filteredLogs.map(entry => (
            <LogEntryCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedIds.has(entry.id)}
              onToggle={() => toggleExpanded(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
