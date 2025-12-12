import React, { useState, useEffect } from 'react';
import { Settings, ChevronUp, ChevronDown, CheckCircle, AlertCircle, GraduationCap, Bug, Settings2, ChevronRight, History, X, Map, Package, Zap, SlidersHorizontal } from 'lucide-react';
import { useDebugStore } from '../../hooks/useDebugStore';
import { getProviderManager } from '../../services/ai';

interface SettingsPanelProps {
  isEducationMode: boolean;
  onEducationModeChange: (value: boolean) => void;
  hasApiKey: boolean;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onProviderChange?: (providerId: string, modelId: string) => void;
  onOpenAISettings?: () => void;
  onOpenMegaSettings?: () => void;
  aiHistoryCount?: number;
  onOpenAIHistory?: () => void;
  onOpenCodeMap?: () => void;
  onOpenTechStack?: () => void;
  autoAcceptChanges?: boolean;
  onAutoAcceptChangesChange?: (value: boolean) => void;
  // Props for modal exclusivity
  shouldClose?: boolean;
  onClosed?: () => void;
  onOpened?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isEducationMode,
  onEducationModeChange,
  hasApiKey: _hasApiKey,
  onOpenAISettings,
  onOpenMegaSettings,
  aiHistoryCount = 0,
  onOpenAIHistory,
  onOpenCodeMap,
  onOpenTechStack,
  autoAcceptChanges = false,
  onAutoAcceptChangesChange,
  shouldClose,
  onClosed,
  onOpened
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { enabled: debugEnabled, setEnabled: setDebugEnabled, logs } = useDebugStore();

  const manager = getProviderManager();
  const activeProvider = manager.getActiveConfig();

  // Handle modal exclusivity - close when shouldClose is true
  useEffect(() => {
    if (shouldClose && isOpen) {
      setIsOpen(false);
      onClosed?.();
    }
  }, [shouldClose, isOpen, onClosed]);

  return (
    <div className="border-t border-white/5 pt-2 flex-none">
      <button
        onClick={() => {
          const newOpenState = !isOpen;
          setIsOpen(newOpenState);
          if (newOpenState) {
            onOpened?.();
          }
        }}
        className="flex items-center justify-between w-full p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
        aria-expanded={isOpen}
        aria-controls="settings-panel"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            id="settings-panel"
            className="w-full max-w-sm bg-slate-950/98 backdrop-blur-xl rounded-2xl border border-white/10 animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Settings</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Close settings"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-3 space-y-1">
              {/* AI Provider Settings - Quick Link */}
              {/* All Settings - Mega Settings Modal */}
              {onOpenMegaSettings && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenMegaSettings();
                  }}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-colors">
                      <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm text-slate-200 font-medium block">All Settings</span>
                      <span className="text-[10px] text-slate-500">AI, Editor, Appearance & more</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Ctrl+,</kbd>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenAISettings?.();
                }}
                className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                    <Settings2 className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm text-slate-200 font-medium block">AI Provider Settings</span>
                    <span className="text-[10px] text-slate-500">API keys, models, endpoints</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeProvider?.apiKey || activeProvider?.isLocal ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>

              {/* Divider */}
              <div className="border-t border-white/5 my-2" />

              {/* Toggle Options */}
              <div className="space-y-1">
                {/* Auto-Accept Changes */}
                {onAutoAcceptChangesChange && (
                  <div className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                        <Zap className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-sm text-slate-200 font-medium block">Auto-Accept Changes</span>
                        <span className="text-[10px] text-slate-500">Skip diff review</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onAutoAcceptChangesChange(!autoAcceptChanges)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        autoAcceptChanges ? 'bg-emerald-600' : 'bg-slate-700'
                      }`}
                      role="switch"
                      aria-checked={autoAcceptChanges}
                    >
                      <span className={`${autoAcceptChanges ? 'translate-x-4' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
                    </button>
                  </div>
                )}

                {/* Education Mode */}
                <div className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-yellow-500/10 rounded-lg">
                      <GraduationCap className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <span className="text-sm text-slate-200 font-medium block">Education Mode</span>
                      <span className="text-[10px] text-slate-500">Learn as you build</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onEducationModeChange(!isEducationMode)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isEducationMode ? 'bg-yellow-600' : 'bg-slate-700'
                    }`}
                    role="switch"
                    aria-checked={isEducationMode}
                  >
                    <span className={`${isEducationMode ? 'translate-x-4' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
                  </button>
                </div>

                {/* Debug Mode */}
                <div className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-500/10 rounded-lg">
                      <Bug className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <span className="text-sm text-slate-200 font-medium block">Debug Mode</span>
                      <span className="text-[10px] text-slate-500">Log API calls</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {debugEnabled && logs.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                        {logs.length}
                      </span>
                    )}
                    <button
                      onClick={() => setDebugEnabled(!debugEnabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        debugEnabled ? 'bg-purple-600' : 'bg-slate-700'
                      }`}
                      role="switch"
                      aria-checked={debugEnabled}
                    >
                      <span className={`${debugEnabled ? 'translate-x-4' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/5 my-2" />

              {/* Quick Links */}
              <div className="space-y-1">
                {/* Technology Stack */}
                {onOpenTechStack && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onOpenTechStack();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                        <Package className="w-4 h-4 text-indigo-400" />
                      </div>
                      <span className="text-sm text-slate-200">Technology Stack</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                )}

                {/* AI History */}
                {onOpenAIHistory && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onOpenAIHistory();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg group-hover:bg-cyan-500/20 transition-colors">
                        <History className="w-4 h-4 text-cyan-400" />
                      </div>
                      <span className="text-sm text-slate-200">AI History</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiHistoryCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                          {aiHistoryCount}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </button>
                )}

                {/* CodeMap */}
                {onOpenCodeMap && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onOpenCodeMap();
                    }}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                        <Map className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-sm text-slate-200">CodeMap</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                        AST
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
};
