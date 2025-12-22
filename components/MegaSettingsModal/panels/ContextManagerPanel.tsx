import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { ConfirmModal } from '../../ContextIndicator/ConfirmModal';
import { SettingsSection, SettingsToggle, SettingsSlider } from '../shared';
import { getFluidFlowConfig, ContextSettings, CompactionLog } from '../../../services/fluidflowConfig';

export const ContextManagerPanel: React.FC = () => {
  const [contextSettings, setContextSettings] = useState<ContextSettings>({
    maxTokensBeforeCompact: 8000,
    compactToTokens: 2000,
    autoCompact: false,
    saveCompactionLogs: true
  });
  const [compactionLogs, setCompactionLogs] = useState<CompactionLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const config = getFluidFlowConfig();
    setContextSettings(config.getContextSettings());
    setCompactionLogs(config.getCompactionLogs());
  }, []);

  const updateSettings = (updates: Partial<ContextSettings>) => {
    const config = getFluidFlowConfig();
    config.updateContextSettings(updates);
    setContextSettings(config.getContextSettings());
  };

  const clearCompactionLogs = () => {
    setShowClearConfirm(true);
  };

  const performClearLogs = () => {
    const config = getFluidFlowConfig();
    config.clearCompactionLogs();
    setCompactionLogs([]);
    setShowClearConfirm(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <MessageSquare className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Context Manager</h2>
          <p className="text-xs text-slate-400">Configure conversation context and token limits</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-300">
          <p className="font-medium text-blue-400 mb-1">How Context Management Works</p>
          <p className="text-slate-400">
            As conversations grow, the context window fills up. When it reaches the threshold,
            older messages are summarized to save space while preserving important information.
            This allows for longer, more productive conversations without losing context.
          </p>
        </div>
      </div>

      {/* Token Settings */}
      <SettingsSection
        title="Token Limits"
        description="Configure when and how context compaction occurs"
      >
        <SettingsSlider
          label="Compaction Threshold"
          description="Start compaction when context reaches this many tokens"
          value={contextSettings.maxTokensBeforeCompact}
          onChange={(value) => updateSettings({ maxTokensBeforeCompact: value })}
          min={2000}
          max={32000}
          step={1000}
          suffix=" tokens"
        />

        <SettingsSlider
          label="Target After Compaction"
          description="Reduce context to approximately this many tokens"
          value={contextSettings.compactToTokens}
          onChange={(value) => updateSettings({ compactToTokens: value })}
          min={500}
          max={8000}
          step={500}
          suffix=" tokens"
        />
      </SettingsSection>

      {/* Behavior Settings */}
      <SettingsSection
        title="Behavior"
        description="Configure how context management behaves"
      >
        <SettingsToggle
          label="Auto-Compact"
          description="Automatically compact context without asking for confirmation"
          checked={contextSettings.autoCompact}
          onChange={(checked) => updateSettings({ autoCompact: checked })}
        />

        <SettingsToggle
          label="Save Compaction Logs"
          description="Keep a record of all compaction operations"
          checked={contextSettings.saveCompactionLogs}
          onChange={(checked) => updateSettings({ saveCompactionLogs: checked })}
        />
      </SettingsSection>

      {/* Compaction Logs */}
      <SettingsSection
        title="Compaction History"
        description={`${compactionLogs.length} compaction${compactionLogs.length !== 1 ? 's' : ''} recorded`}
      >
        {compactionLogs.length > 0 ? (
          <>
            <div className="flex justify-end mb-2">
              <button
                onClick={clearCompactionLogs}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {compactionLogs.slice().reverse().map(log => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-800/50 border border-white/5 rounded-lg"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm text-white">
                          {formatTokens(log.beforeTokens)} → {formatTokens(log.afterTokens)} tokens
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDate(log.timestamp)} • {log.messagesSummarized} messages summarized
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-400">
                        -{formatTokens(log.beforeTokens - log.afterTokens)}
                      </span>
                    </div>
                  </div>
                  {expandedLog === log.id && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="text-xs text-slate-400 mb-1">Summary:</div>
                      <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900/50 p-2 rounded">
                        {log.summary}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No compaction logs yet</p>
              <p className="text-xs mt-1">Logs will appear here after context compaction occurs</p>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Context Types Info */}
      <SettingsSection
        title="Context Types"
        description="Different conversation contexts are managed separately"
      >
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'main-chat', name: 'Main Chat', desc: 'Primary code generation' },
            { id: 'prompt-improver', name: 'Prompt Improver', desc: 'Prompt enhancement' },
            { id: 'git-commit', name: 'Git Commit', desc: 'Commit messages' },
            { id: 'quick-edit', name: 'Quick Edit', desc: 'Inline modifications' },
            { id: 'code-review', name: 'Code Review', desc: 'Code analysis' },
            { id: 'db-studio', name: 'DB Studio', desc: 'Database operations' },
          ].map(ctx => (
            <div key={ctx.id} className="p-2 bg-slate-800/30 rounded-lg">
              <div className="text-sm text-white">{ctx.name}</div>
              <div className="text-xs text-slate-500">{ctx.desc}</div>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={performClearLogs}
        title="Clear Compaction Logs"
        message="This will permanently delete all compaction history. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />
    </div>
  );
};

export default ContextManagerPanel;
