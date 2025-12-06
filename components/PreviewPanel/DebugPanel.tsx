import React, { useState, useMemo } from 'react';
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

  if (data === null) return <span className="text-orange-400">null</span>;
  if (data === undefined) return <span className="text-gray-500">undefined</span>;
  if (typeof data === 'boolean') return <span className="text-purple-400">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-blue-400">{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 500) {
      return (
        <span className="text-green-400">
          "{data.slice(0, 500)}
          <span className="text-gray-500">... ({data.length} chars)</span>"
        </span>
      );
    }
    return <span className="text-green-400">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400">[]</span>;
    return (
      <div className="inline">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center hover:bg-white/5 rounded px-0.5"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-gray-400">[</span>
          {isCollapsed && <span className="text-gray-500 text-xs ml-1">{data.length} items</span>}
        </button>
        {!isCollapsed && (
          <div className="ml-4 border-l border-white/10 pl-2">
            {data.map((item, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-gray-500 text-xs mr-2">{i}:</span>
                <JsonViewer data={item} depth={depth + 1} />
                {i < data.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            ))}
          </div>
        )}
        {!isCollapsed && <span className="text-gray-400">]</span>}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-gray-400">{'{}'}</span>;
    return (
      <div className="inline">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center hover:bg-white/5 rounded px-0.5"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-gray-400">{'{'}</span>
          {isCollapsed && <span className="text-gray-500 text-xs ml-1">{entries.length} keys</span>}
        </button>
        {!isCollapsed && (
          <div className="ml-4 border-l border-white/10 pl-2">
            {entries.map(([key, value], i) => (
              <div key={key} className="leading-relaxed">
                <span className="text-cyan-400">"{key}"</span>
                <span className="text-gray-400">: </span>
                <JsonViewer data={value} depth={depth + 1} />
                {i < entries.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            ))}
          </div>
        )}
        {!isCollapsed && <span className="text-gray-400">{'}'}</span>}
      </div>
    );
  }

  return <span className="text-gray-400">{String(data)}</span>;
}

interface LogEntryCardProps {
  entry: DebugLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

const LogEntryCard: React.FC<LogEntryCardProps> = ({ entry, isExpanded, onToggle }) => {
  const [copied, setCopied] = useState(false);

  const typeConfig = {
    request: { icon: ArrowUpCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    response: { icon: ArrowDownCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    stream: { icon: Radio, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    info: { icon: Info, color: 'text-gray-400', bg: 'bg-gray-500/10' },
  };

  const config = typeConfig[entry.type];
  const Icon = config.icon;

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('tr-TR', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPreview = () => {
    if (entry.prompt) return entry.prompt.slice(0, 100) + (entry.prompt.length > 100 ? '...' : '');
    if (entry.response) return entry.response.slice(0, 100) + (entry.response.length > 100 ? '...' : '');
    if (entry.error) return entry.error.slice(0, 100) + (entry.error.length > 100 ? '...' : '');
    return entry.category;
  };

  return (
    <div className={`rounded-lg border border-white/10 overflow-hidden ${config.bg}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-white/5 transition-colors text-left"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className={config.color} />
        <span className={`text-xs font-medium uppercase ${config.color}`}>{entry.type}</span>
        <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-white/5 rounded">{entry.category}</span>
        {entry.model && (
          <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-white/5 rounded flex items-center gap-1">
            <Zap size={10} />
            {entry.model}
          </span>
        )}
        {entry.duration !== undefined && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock size={10} />
            {entry.duration}ms
          </span>
        )}
        <span className="flex-1 text-xs text-gray-500 truncate">{getPreview()}</span>
        <span className="text-xs text-gray-600">{formatTime(entry.timestamp)}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-white/10 p-3 space-y-3 bg-black/20">
          <div className="flex justify-end">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>

          {entry.prompt && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-medium">Prompt:</div>
              <div className="bg-black/30 rounded p-2 text-xs font-mono overflow-auto max-h-48">
                <pre className="whitespace-pre-wrap text-gray-300">{entry.prompt}</pre>
              </div>
            </div>
          )}

          {entry.systemInstruction && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-medium">System Instruction:</div>
              <div className="bg-black/30 rounded p-2 text-xs font-mono overflow-auto max-h-48">
                <pre className="whitespace-pre-wrap text-gray-300">{entry.systemInstruction}</pre>
              </div>
            </div>
          )}

          {entry.attachments && entry.attachments.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-medium">Attachments:</div>
              <div className="flex flex-wrap gap-2">
                {entry.attachments.map((att, i) => (
                  <span key={i} className="text-xs bg-white/5 px-2 py-1 rounded">
                    {att.type} ({(att.size / 1024).toFixed(1)} KB)
                  </span>
                ))}
              </div>
            </div>
          )}

          {entry.response && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-medium">Response:</div>
              <div className="bg-black/30 rounded p-2 text-xs font-mono overflow-auto max-h-96">
                {entry.response.startsWith('{') || entry.response.startsWith('[') ? (
                  <JsonViewer data={JSON.parse(entry.response)} />
                ) : (
                  <pre className="whitespace-pre-wrap text-gray-300">{entry.response}</pre>
                )}
              </div>
            </div>
          )}

          {entry.error && (
            <div>
              <div className="text-xs text-red-400 mb-1 font-medium">Error:</div>
              <div className="bg-red-500/10 rounded p-2 text-xs font-mono text-red-300">
                {entry.error}
              </div>
            </div>
          )}

          {entry.tokenCount && (
            <div className="flex gap-4 text-xs">
              {entry.tokenCount.input !== undefined && (
                <span className="text-gray-400">
                  Input tokens: <span className="text-blue-400">{entry.tokenCount.input}</span>
                </span>
              )}
              {entry.tokenCount.output !== undefined && (
                <span className="text-gray-400">
                  Output tokens: <span className="text-green-400">{entry.tokenCount.output}</span>
                </span>
              )}
            </div>
          )}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-medium">Metadata:</div>
              <div className="bg-black/30 rounded p-2 text-xs font-mono overflow-auto max-h-48">
                <JsonViewer data={entry.metadata} />
              </div>
            </div>
          )}
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

  const typeOptions: DebugLogEntry['type'][] = ['request', 'response', 'stream', 'error', 'info'];
  const categoryOptions: DebugLogEntry['category'][] = ['generation', 'accessibility', 'quick-edit', 'auto-fix', 'other'];

  return (
    <div className="h-full flex flex-col bg-black/20">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Bug size={16} className="text-purple-400" />
          <span className="font-medium">Debug Console</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
              enabled
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10'
            }`}
          >
            {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
            {enabled ? 'Logging Active' : 'Logging Disabled'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-blue-500/10 rounded text-blue-400">{stats.requests} req</span>
            <span className="px-2 py-0.5 bg-green-500/10 rounded text-green-400">{stats.responses} res</span>
            {stats.errors > 0 && (
              <span className="px-2 py-0.5 bg-red-500/10 rounded text-red-400">{stats.errors} err</span>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded transition-colors ${
              showFilters ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-400'
            }`}
          >
            <Filter size={14} />
          </button>
          <button
            onClick={clearLogs}
            className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Clear logs"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-3 border-b border-white/10 space-y-3 bg-black/20">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filter.searchQuery}
              onChange={e => setFilter({ searchQuery: e.target.value })}
              className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-purple-500/50"
            />
            {filter.searchQuery && (
              <button
                onClick={() => setFilter({ searchQuery: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type filter */}
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Type</div>
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
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    filter.types.includes(type)
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-white/5 text-gray-500 border border-white/10'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Category</div>
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
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    filter.categories.includes(cat)
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-white/5 text-gray-500 border border-white/10'
                  }`}
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
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <EyeOff size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Debug logging is disabled</p>
            <p className="text-sm mt-1">Enable logging to monitor API calls</p>
            <button
              onClick={() => setEnabled(true)}
              className="mt-4 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              Enable Debug Mode
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
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
