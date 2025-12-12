import React, { useState } from 'react';
import { Keyboard, Info } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
}

interface ShortcutCategory {
  id: string;
  label: string;
  shortcuts: ShortcutItem[];
}

// Actual shortcuts that exist in the application
const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'general',
    label: 'General',
    shortcuts: [
      { keys: ['Ctrl', ','], label: 'Open Settings', description: 'Open the settings modal' },
      { keys: ['Ctrl', 'O'], label: 'Open Project', description: 'Open project manager' },
      { keys: ['Ctrl', 'K'], label: 'Command Palette', description: 'Open command palette' },
      { keys: ['Escape'], label: 'Close Modal', description: 'Close any open modal' },
    ]
  },
  {
    id: 'editor',
    label: 'Code Editor',
    shortcuts: [
      { keys: ['Ctrl', 'S'], label: 'Save', description: 'Save current file (auto-saves)' },
      { keys: ['Ctrl', 'Z'], label: 'Undo', description: 'Undo last change' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo', description: 'Redo undone change' },
      { keys: ['Ctrl', 'F'], label: 'Find', description: 'Search in current file' },
      { keys: ['Ctrl', 'H'], label: 'Replace', description: 'Find and replace' },
      { keys: ['Ctrl', '/'], label: 'Comment', description: 'Toggle line comment' },
    ]
  },
  {
    id: 'preview',
    label: 'Preview',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'P'], label: 'Refresh Preview', description: 'Reload the preview iframe' },
    ]
  },
  {
    id: 'ai',
    label: 'AI Features',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'H'], label: 'AI History', description: 'Open AI generation history' },
      { keys: ['Enter'], label: 'Send Message', description: 'Send message to AI (in chat)' },
      { keys: ['Shift', 'Enter'], label: 'New Line', description: 'Add new line in chat input' },
    ]
  }
];

export const ShortcutsPanel: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('general');
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  const formatKey = (key: string): string => {
    if (isMac) {
      if (key === 'Ctrl') return '⌘';
      if (key === 'Shift') return '⇧';
      if (key === 'Alt') return '⌥';
    }
    if (key === 'Enter') return '↵';
    if (key === 'Escape') return 'Esc';
    return key;
  };

  const selectedCategoryData = SHORTCUT_CATEGORIES.find(c => c.id === selectedCategory);

  return (
    <div className="flex h-full">
      {/* Category List - Left */}
      <div className="w-48 border-r border-white/5 flex flex-col bg-slate-950/30">
        <div className="p-3 border-b border-white/5">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Categories</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {SHORTCUT_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full p-2.5 rounded-lg text-left transition-all ${
                selectedCategory === cat.id
                  ? 'bg-white/10 border border-white/20'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">{cat.label}</span>
                <span className="text-xs text-slate-500">{cat.shortcuts.length}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Shortcuts - Right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Keyboard className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
            <p className="text-xs text-slate-400">Quick reference for available shortcuts</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Info */}
          <div className="flex items-start gap-3 p-3 bg-slate-800/50 border border-white/5 rounded-lg mb-4">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Shortcuts are displayed for {isMac ? 'macOS' : 'Windows/Linux'}.
              Some shortcuts may conflict with browser shortcuts.
            </p>
          </div>

          {/* Shortcuts List */}
          <div className="space-y-2">
            {selectedCategoryData?.shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-slate-800/30 border border-white/5 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{shortcut.label}</div>
                  <p className="text-xs text-slate-500 mt-0.5">{shortcut.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <React.Fragment key={i}>
                      <kbd className="px-2 py-1 bg-slate-700 border border-white/10 rounded text-xs text-slate-300 font-mono">
                        {formatKey(key)}
                      </kbd>
                      {i < shortcut.keys.length - 1 && (
                        <span className="text-slate-600">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/5 bg-slate-950/30">
          <div className="text-xs text-slate-500">
            <strong>Tip:</strong> Use <kbd className="px-1 py-0.5 bg-slate-700 rounded">Ctrl + K</kbd> to
            open the command palette and discover available actions.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsPanel;
