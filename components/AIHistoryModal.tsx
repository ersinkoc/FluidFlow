import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  FileCode,
  Copy,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { AIHistoryEntry } from '../services/projectApi';

interface AIHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: AIHistoryEntry[];
  onClearHistory: () => void;
  onDeleteEntry: (id: string) => void;
  onExportHistory: () => string;
  onRestoreEntry?: (entry: AIHistoryEntry) => Promise<boolean>;
}

export const AIHistoryModal: React.FC<AIHistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onClearHistory,
  onDeleteEntry,
  onExportHistory,
  onRestoreEntry
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatSize = (chars: number) => {
    if (chars < 1024) return `${chars} chars`;
    return `${(chars / 1024).toFixed(1)}KB`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleCopyRaw = async (entry: AIHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.rawResponse);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleExport = () => {
    const json = onExportHistory();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (entry: AIHistoryEntry) => {
    if (!onRestoreEntry || restoringId) return;

    setRestoringId(entry.id);
    try {
      const success = await onRestoreEntry(entry);
      if (success) {
        onClose();
      }
    } finally {
      setRestoringId(null);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-7xl h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Sparkles size={20} className="text-purple-400" />
            <span className="font-medium text-lg">AI Generation History</span>
            <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
              {history.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
              title="Export history as JSON"
            >
              <Download size={14} />
              Export
            </button>
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all AI history? This cannot be undone.')) {
                    onClearHistory();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock size={48} className="mx-auto mb-4 opacity-30" />
              <p>No AI generation history yet</p>
              <p className="text-sm text-slate-600 mt-2">
                History will appear here after generating code
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    entry.success
                      ? 'border-white/10 bg-slate-800/30'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  {/* Entry Header */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 group"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    {expandedId === entry.id ? (
                      <ChevronDown size={16} className="text-slate-500" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-500" />
                    )}

                    {entry.success ? (
                      <CheckCircle2 size={16} className="text-green-400" />
                    ) : (
                      <XCircle size={16} className="text-red-400" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {entry.prompt.slice(0, 60)}{entry.prompt.length > 60 ? '...' : ''}
                        </span>
                        {entry.truncated && (
                          <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
                            TRUNCATED
                          </span>
                        )}
                        {entry.isUpdate && (
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
                            UPDATE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        <span>{formatTime(entry.timestamp)}</span>
                        <span>{entry.provider} / {entry.model}</span>
                        <span>{formatDuration(entry.durationMs)}</span>
                        <span>{formatSize(entry.responseChars)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Restore button - only for successful entries */}
                      {entry.success && onRestoreEntry && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(entry);
                          }}
                          disabled={restoringId !== null}
                          className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-green-500/20 text-slate-500 hover:text-green-400 rounded transition-all disabled:opacity-50"
                          title="Load this state"
                        >
                          {restoringId === entry.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEntry(entry.id);
                        }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-all"
                        title="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedId === entry.id && (
                    <div className="border-t border-white/10 p-4 space-y-4">
                      {/* Info Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-slate-500">Provider</div>
                          <div className="font-medium">{entry.provider}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-slate-500">Model</div>
                          <div className="font-medium truncate">{entry.model}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-slate-500">Duration</div>
                          <div className="font-medium">{formatDuration(entry.durationMs)}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-slate-500">Response Size</div>
                          <div className="font-medium">{formatSize(entry.responseChars)}</div>
                        </div>
                      </div>

                      {/* Attachments */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">Attachments:</span>
                        {entry.hasSketch && (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                            Sketch
                          </span>
                        )}
                        {entry.hasBrand && (
                          <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded">
                            Brand
                          </span>
                        )}
                        {!entry.hasSketch && !entry.hasBrand && (
                          <span className="text-slate-600">None</span>
                        )}
                      </div>

                      {/* Error Message */}
                      {entry.error && (
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-red-400">{entry.error}</div>
                        </div>
                      )}

                      {/* Files Generated */}
                      {entry.filesGenerated && entry.filesGenerated.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 mb-2">
                            Files Generated ({entry.filesGenerated.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {entry.filesGenerated.map((file) => (
                              <span
                                key={file}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-800/50 rounded text-xs text-slate-400"
                              >
                                <FileCode size={12} />
                                {file}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Restore Button - prominent in expanded view */}
                      {entry.success && onRestoreEntry && (
                        <div className="pt-2 border-t border-white/5">
                          <button
                            onClick={() => handleRestore(entry)}
                            disabled={restoringId !== null}
                            className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {restoringId === entry.id ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Restoring...
                              </>
                            ) : (
                              <>
                                <RotateCcw size={16} />
                                Load This State
                              </>
                            )}
                          </button>
                          <p className="text-[11px] text-slate-500 mt-2">
                            Restores files and chat from this generation point.
                          </p>
                        </div>
                      )}

                      {/* Explanation */}
                      {entry.explanation && (
                        <div>
                          <div className="text-xs text-slate-500 mb-2">Explanation</div>
                          <div className="p-3 bg-slate-800/50 rounded-lg text-sm text-slate-300 max-h-32 overflow-y-auto">
                            {entry.explanation.slice(0, 500)}{entry.explanation.length > 500 ? '...' : ''}
                          </div>
                        </div>
                      )}

                      {/* Prompt */}
                      <div>
                        <div className="text-xs text-slate-500 mb-2">Full Prompt</div>
                        <div className="p-3 bg-slate-800/50 rounded-lg text-sm text-slate-300 max-h-24 overflow-y-auto">
                          {entry.prompt}
                        </div>
                      </div>

                      {/* Raw Response Toggle */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500">
                            Raw Response ({formatSize(entry.responseChars)})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyRaw(entry)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                            >
                              <Copy size={12} />
                              {copiedId === entry.id ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                              onClick={() => setShowRawResponse(showRawResponse === entry.id ? null : entry.id)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              {showRawResponse === entry.id ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                        {showRawResponse === entry.id && (
                          <pre className="p-3 bg-slate-950 rounded-lg text-xs text-slate-400 max-h-64 overflow-auto font-mono whitespace-pre-wrap break-all">
                            {entry.rawResponse}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none p-3 border-t border-white/10 bg-slate-900/50">
          <div className="text-xs text-slate-600 text-center">
            Click <RotateCcw size={10} className="inline mx-0.5" /> to load files and chat from a previous state.
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside of parent DOM hierarchy
  return createPortal(modalContent, document.body);
};

export default AIHistoryModal;
