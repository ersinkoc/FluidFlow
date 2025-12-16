/**
 * PromptLevelModal - Modal for selecting prompt complexity level
 * Shows Simple/Detailed/Advanced options with preview
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileText, BookOpen, Check, Settings2 } from 'lucide-react';
import { PromptItem, PromptLevel } from '../../data/promptLibrary';

interface PromptLevelModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: PromptItem | null;
  onSelect: (promptText: string, level: PromptLevel) => void;
  defaultLevel: PromptLevel;
  onSetDefaultLevel: (level: PromptLevel) => void;
}

const LEVEL_CONFIG: Record<PromptLevel, {
  label: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
}> = {
  simple: {
    label: 'Simple',
    icon: Sparkles,
    description: 'Brief, 1-2 sentence prompt',
    color: 'emerald',
  },
  detailed: {
    label: 'Detailed',
    icon: FileText,
    description: 'Comprehensive with Tailwind classes',
    color: 'blue',
  },
  advanced: {
    label: 'Advanced',
    icon: BookOpen,
    description: 'Expert-level with edge cases & a11y',
    color: 'purple',
  },
};

export const PromptLevelModal: React.FC<PromptLevelModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onSelect,
  defaultLevel,
  onSetDefaultLevel,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<PromptLevel>(defaultLevel);
  const [showSetDefault, setShowSetDefault] = useState(false);

  // Reset to default when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedLevel(defaultLevel);
      setShowSetDefault(false);
    }
  }, [isOpen, defaultLevel]);

  if (!isOpen || !prompt) return null;

  const handleSelect = () => {
    const text = prompt[selectedLevel];
    onSelect(text, selectedLevel);
    onClose();
  };

  const handleSetDefault = () => {
    onSetDefaultLevel(selectedLevel);
    setShowSetDefault(true);
    setTimeout(() => setShowSetDefault(false), 2000);
  };

  const config = LEVEL_CONFIG[selectedLevel];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl border border-white/5">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{prompt.label}</h2>
              <p className="text-xs text-slate-500">Select complexity level</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Tabs */}
        <div className="px-5 py-3 border-b border-white/5">
          <div className="flex gap-2">
            {(Object.keys(LEVEL_CONFIG) as PromptLevel[]).map((level) => {
              const cfg = LEVEL_CONFIG[level];
              const Icon = cfg.icon;
              const isSelected = selectedLevel === level;
              const isDefault = defaultLevel === level;

              return (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    isSelected
                      ? `bg-${cfg.color}-500/20 border-${cfg.color}-500/50 text-${cfg.color}-300`
                      : 'border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                  style={isSelected ? {
                    backgroundColor: `rgb(var(--color-${cfg.color}-500) / 0.2)`,
                    borderColor: `rgb(var(--color-${cfg.color}-500) / 0.5)`,
                  } : {}}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{cfg.label}</span>
                  {isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Level Description */}
        <div className="px-5 py-3 border-b border-white/5 bg-slate-950/30">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-400">{config.label}:</span> {config.description}
          </p>
        </div>

        {/* Preview */}
        <div className="px-5 py-4 max-h-64 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {prompt[selectedLevel]}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/5 bg-slate-950/50">
          <button
            onClick={handleSetDefault}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
              showSetDefault
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {showSetDefault ? (
              <>
                <Check className="w-4 h-4" />
                Saved as default
              </>
            ) : (
              <>
                <Settings2 className="w-4 h-4" />
                Set as default
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm font-medium rounded-lg transition-all"
            >
              Use Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Quick Level Toggle - Compact level selector for inline use
 */
interface QuickLevelToggleProps {
  value: PromptLevel;
  onChange: (level: PromptLevel) => void;
  size?: 'sm' | 'md';
}

export const QuickLevelToggle: React.FC<QuickLevelToggleProps> = ({
  value,
  onChange,
  size = 'sm',
}) => {
  const levels: PromptLevel[] = ['simple', 'detailed', 'advanced'];
  const labels = { simple: 'S', detailed: 'D', advanced: 'A' };
  const fullLabels = { simple: 'Simple', detailed: 'Detailed', advanced: 'Advanced' };

  return (
    <div
      className={`inline-flex items-center rounded-lg bg-slate-800/50 border border-white/5 ${
        size === 'sm' ? 'p-0.5' : 'p-1'
      }`}
      title="Prompt complexity level"
    >
      {levels.map((level) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          className={`${size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium rounded-md transition-all ${
            value === level
              ? 'bg-purple-500/30 text-purple-300 border border-purple-500/30'
              : 'text-slate-500 hover:text-slate-300'
          }`}
          title={fullLabels[level]}
        >
          {size === 'sm' ? labels[level] : fullLabels[level]}
        </button>
      ))}
    </div>
  );
};

/**
 * Hook for managing prompt level preference
 */
const STORAGE_KEY = 'fluidflow_prompt_level';

export function usePromptLevel(): [PromptLevel, (level: PromptLevel) => void] {
  const [level, setLevel] = useState<PromptLevel>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['simple', 'detailed', 'advanced'].includes(stored)) {
        return stored as PromptLevel;
      }
    }
    return 'detailed'; // Default to detailed
  });

  const setAndPersist = (newLevel: PromptLevel) => {
    setLevel(newLevel);
    localStorage.setItem(STORAGE_KEY, newLevel);
  };

  return [level, setAndPersist];
}
