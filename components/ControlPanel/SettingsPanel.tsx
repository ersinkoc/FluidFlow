import React, { useState } from 'react';
import { Settings, ChevronUp, ChevronDown, CheckCircle, AlertCircle, GraduationCap, Zap, Sparkles } from 'lucide-react';
import { AI_MODELS } from '../../types';

interface SettingsPanelProps {
  isEducationMode: boolean;
  onEducationModeChange: (value: boolean) => void;
  hasApiKey: boolean;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isEducationMode,
  onEducationModeChange,
  hasApiKey,
  selectedModel,
  onModelChange
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-white/5 pt-2 flex-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
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
        <div
          id="settings-panel"
          className="absolute bottom-16 left-6 right-6 p-4 bg-slate-950/90 backdrop-blur-xl rounded-xl border border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-2xl z-50"
        >
          <div className="space-y-2">
            <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              API Connection
            </label>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-sm text-slate-300">Gemini API</span>
              </div>
              {hasApiKey ? (
                <CheckCircle className="w-4 h-4 text-green-500/50" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500/50" />
              )}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block">
              AI Model
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => onModelChange(model.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    selectedModel === model.id
                      ? 'bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'bg-slate-900/50 border-white/5 hover:border-white/20 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {model.tier === 'pro' ? (
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-green-400" />
                    )}
                    <span className={`text-xs font-medium ${selectedModel === model.id ? 'text-blue-300' : 'text-slate-300'}`}>
                      {model.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 pl-5">{model.description}</p>
                  {model.tier === 'pro' && (
                    <span className="inline-block mt-1 ml-5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      PRO
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-300 font-medium flex items-center gap-2">
                <GraduationCap className="w-3.5 h-3.5 text-yellow-400" />
                Education Mode
              </label>
              <button
                onClick={() => onEducationModeChange(!isEducationMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isEducationMode ? 'bg-yellow-600' : 'bg-slate-700'
                }`}
                role="switch"
                aria-checked={isEducationMode}
                aria-label="Toggle education mode"
              >
                <span
                  className={`${
                    isEducationMode ? 'translate-x-4' : 'translate-x-1'
                  } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
