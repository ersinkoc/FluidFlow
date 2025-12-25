import React, { useState, useEffect } from 'react';
import {
  Zap,
  MessageSquare,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { getContextManager } from '@/services/conversationContext';
import { ContextIndicatorProps } from './types';
import { getMinRemainingTokens, getModelContextSize, getRemainingContext, needsCompaction } from './utils';
import { ContextManagerModal } from './ContextManagerModal';

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  contextId,
  showLabel: _showLabel = true,
  onCompact,
  className = ''
}) => {
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState<{ messages: number; tokens: number } | null>(null);

  const contextManager = getContextManager();
  const minRemainingTokens = getMinRemainingTokens();
  const modelContextSize = getModelContextSize();

  useEffect(() => {
    const updateStats = () => {
      // Ensure context exists before getting stats
      contextManager.getContext(contextId);
      const s = contextManager.getStats(contextId);
      if (s) {
        setStats({ messages: s.messages, tokens: s.tokens });
      }
    };

    updateStats();
    // Update every 2 seconds
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
    // Note: contextManager is a singleton that doesn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId]);

  if (!stats) {
    // Initialize with default stats while loading
    return (
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${className}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-slate-600 rounded-full w-0" />
          </div>
          <span className="text-xs font-mono text-slate-500 whitespace-nowrap">0%</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 font-mono whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" />
            <span className="text-slate-400">Msg:</span>
            0
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4" />
            <span className="text-slate-400">Tok:</span>
            0k
          </span>
        </div>
        <div className="w-4 h-4" /> {/* Spacer for clear button */}
      </div>
    );
  }

  // Calculate usage and remaining context
  const usagePercent = Math.min(100, (stats.tokens / modelContextSize) * 100);
  const remainingTokens = getRemainingContext(stats.tokens);
  const needsCompact = needsCompaction(stats.tokens);

  // Warning levels based on remaining context (not usage percentage)
  // Warning when remaining is less than 2x minimum
  // Critical when remaining is less than minimum (needs compaction)
  const isWarning = remainingTokens < minRemainingTokens * 2;
  const isCritical = needsCompact;

  const getColor = () => {
    if (isCritical) return 'text-red-400';
    if (isWarning) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getBgColor = () => {
    if (isCritical) return 'bg-red-500';
    if (isWarning) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <>
      {/* Compact Indicator */}
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${className}`}
        title={`${stats.tokens.toLocaleString()} tokens used • ${remainingTokens.toLocaleString()} remaining (min: ${minRemainingTokens.toLocaleString()}) • ${modelContextSize.toLocaleString()} total context - Click for details`}
      >
        {/* Mini progress bar */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBgColor()} rounded-full transition-all duration-300`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <span className={`text-xs font-mono ${getColor()} whitespace-nowrap`}>
            {Math.round(usagePercent)}%
          </span>

          {isCritical && (
            <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
          )}
        </button>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-slate-500 font-mono whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" />
            <span className="text-slate-400">Msg:</span>
            {stats.messages}
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4" />
            <span className="text-slate-400">Tok:</span>
            {Math.round(stats.tokens / 1000)}k
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Quick Compact Button - show when remaining context is low */}
          {isWarning && onCompact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCompact();
              }}
              className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400 hover:text-blue-300 transition-colors"
              title="Compact context"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}

          {/* Clear Messages Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              contextManager.clearContext(contextId);
            }}
            className="p-1.5 hover:bg-slate-700/50 rounded text-slate-500 hover:text-red-400 transition-colors"
            title="Clear messages"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && (
        <ContextManagerModal
          contextId={contextId}
          onClose={() => setShowModal(false)}
          onCompact={onCompact}
        />
      )}
    </>
  );
};

export default ContextIndicator;

// Re-export all components for external use
export { ConfirmModal } from './ConfirmModal';
export { ContextManagerModal } from './ContextManagerModal';
// eslint-disable-next-line react-refresh/only-export-components -- Utility re-export for module API
export { getModelContextSize } from './utils';
export type { ContextIndicatorProps, ContextManagerModalProps, ConfirmModalProps } from './types';
