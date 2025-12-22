/**
 * Compaction Preview Modal
 *
 * Shows which messages will be compacted before actually doing it
 */

import React from 'react';
import { FileText, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

export interface CompactionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  contextId: string;
  messagesToCompact: Array<{
    id: string;
    role: string;
    preview: string;
    timestamp?: number;
  }>;
  stats: {
    beforeTokens: number;
    afterTokens: number;
    messagesToSummarize: number;
    messagesToKeep: number;
  };
}

export const CompactionPreviewModal: React.FC<CompactionPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  contextId: _contextId,
  messagesToCompact,
  stats,
}) => {
  if (!isOpen) return null;

  const tokensSaved = stats.beforeTokens - stats.afterTokens;
  const percentSaved = ((tokensSaved / stats.beforeTokens) * 100).toFixed(0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <MessageSquare className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Context Compaction Preview</h2>
              <p className="text-xs text-slate-400">Review messages before compacting</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Stats Summary */}
          <div className="mb-6 p-4 bg-slate-800/50 border border-white/5 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-slate-500 mb-1">Before</div>
                <div className="text-lg font-semibold text-white">{stats.beforeTokens.toLocaleString()}</div>
                <div className="text-xs text-slate-500">tokens</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">After</div>
                <div className="text-lg font-semibold text-emerald-400">{stats.afterTokens.toLocaleString()}</div>
                <div className="text-xs text-slate-500">tokens</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Saved</div>
                <div className="text-lg font-semibold text-blue-400">{tokensSaved.toLocaleString()}</div>
                <div className="text-xs text-slate-500">tokens ({percentSaved}%)</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Messages</div>
                <div className="text-lg font-semibold text-amber-400">{stats.messagesToSummarize}</div>
                <div className="text-xs text-slate-500">to summarize</div>
              </div>
            </div>
          </div>

          {/* Messages to Compact */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Messages to be Summarized ({messagesToCompact.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {messagesToCompact.map((msg, index) => (
                <div
                  key={msg.id}
                  className="p-3 bg-slate-800/30 border border-amber-500/20 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${
                      msg.role === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {msg.role === 'user' ? (
                        <MessageSquare className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-white capitalize">{msg.role}</span>
                        <span className="text-xs text-slate-500">#{index + 1}</span>
                      </div>
                      <p className="text-sm text-slate-400 line-clamp-2">
                        {msg.preview}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              These messages will be summarized by AI to save tokens while preserving important context.
              The summary will replace all selected messages.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-slate-950/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Confirm Compaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactionPreviewModal;
