import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  AlertTriangle,
  Zap,
  Database,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface CompactionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  contextId: string;
  currentTokens: number;
  targetTokens: number;
  messageCount: number;
  conversationPreview: string;
}

export const CompactionConfirmModal: React.FC<CompactionConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  contextId: _contextId,
  currentTokens,
  targetTokens,
  messageCount,
  conversationPreview
}) => {
  const [isCompacting, setIsCompacting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsCompacting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compaction failed');
    } finally {
      setIsCompacting(false);
    }
  };

  const reductionPercent = Math.round((1 - targetTokens / currentTokens) * 100);

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <Database className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-medium text-lg">Context Compaction</h2>
              <p className="text-xs text-slate-500">Summarize old messages to save tokens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-amber-200 font-medium">Context limit approaching</p>
              <p className="text-amber-200/70 mt-1">
                Your conversation history is getting long. Compacting will summarize older messages
                while preserving key information.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{messageCount}</div>
              <div className="text-xs text-slate-500">Messages</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-400">~{Math.round(currentTokens / 1000)}k</div>
              <div className="text-xs text-slate-500">Current Tokens</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">~{Math.round(targetTokens / 1000)}k</div>
              <div className="text-xs text-slate-500">After Compact</div>
            </div>
          </div>

          {/* Reduction indicator */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-green-500 rounded-full transition-all"
                style={{ width: `${100 - reductionPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-green-400">{reductionPercent}% reduction</span>
          </div>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            {showPreview ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <FileText className="w-4 h-4" />
            Preview conversation to be summarized
          </button>

          {showPreview && (
            <div className="max-h-40 overflow-y-auto bg-slate-950 rounded-lg p-3 text-xs text-slate-400 font-mono whitespace-pre-wrap">
              {conversationPreview || 'No conversation to preview'}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-slate-500 space-y-1">
            <p>• Recent messages will be kept intact</p>
            <p>• Older messages will be summarized by AI</p>
            <p>• A log will be saved to .fluidflow/logs/</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10 bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isCompacting}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isCompacting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Compacting...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Compact Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CompactionConfirmModal;
