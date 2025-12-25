import React, { useState } from 'react';
import {
  X, Palette, Smartphone, Sparkles, Zap, LayoutGrid, Accessibility,
  FileText, Wrench, ChevronRight, Search, BookOpen
} from 'lucide-react';
import { promptLibrary, quickPrompts, PromptItem, PromptLevel } from '../../data/promptLibrary';
import { PromptLevelModal, QuickLevelToggle } from './PromptLevelModal';
import { usePromptLevel } from './hooks';

interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Palette,
  Smartphone,
  Sparkles,
  Zap,
  LayoutGrid,
  Accessibility,
  FileText,
  Wrench,
};

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose, onSelectPrompt }) => {
  const [activeCategory, setActiveCategory] = useState<string>(promptLibrary[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [defaultLevel, setDefaultLevel] = usePromptLevel();

  if (!isOpen) return null;

  const activePrompts = promptLibrary.find(c => c.id === activeCategory)?.prompts || [];

  // Filter prompts based on search
  const filteredPrompts = searchQuery
    ? promptLibrary.flatMap(cat =>
        cat.prompts.filter(p =>
          p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.detailed.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(p => ({ ...p, category: cat.name }))
      )
    : activePrompts;

  // Handle prompt click - show level modal
  const handlePromptClick = (prompt: PromptItem) => {
    setSelectedPrompt(prompt);
    setShowLevelModal(true);
  };

  // Handle level selection from modal
  const handleLevelSelect = (promptText: string, _level: PromptLevel) => {
    onSelectPrompt(promptText);
    onClose();
  };

  // Quick select using default level (for quick prompts footer)
  const handleQuickSelect = (prompt: PromptItem) => {
    onSelectPrompt(prompt[defaultLevel]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl border border-white/5">
              <BookOpen className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Prompt Library</h2>
              <p className="text-xs text-slate-500">Ready-to-use design prompts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Level</span>
              <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-white/5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categories Sidebar */}
          {!searchQuery && (
            <div className="w-48 border-r border-white/5 overflow-y-auto custom-scrollbar p-2 flex-shrink-0">
              {promptLibrary.map(category => {
                const Icon = iconMap[category.icon] || Sparkles;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${
                      activeCategory === category.id
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{category.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Prompts List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            {searchQuery && (
              <p className="text-xs text-slate-500 mb-3">
                Found {filteredPrompts.length} prompts matching "{searchQuery}"
              </p>
            )}

            <div className="space-y-2">
              {filteredPrompts.map((prompt: PromptItem & { category?: string }) => (
                <button
                  key={prompt.id}
                  onClick={() => handlePromptClick(prompt)}
                  className="w-full group flex items-start gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/60 border border-white/5 hover:border-purple-500/30 transition-all text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">
                        {prompt.label}
                      </span>
                      {prompt.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                          {prompt.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prompt[defaultLevel]}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors flex-shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer with Quick Prompts */}
        <div className="px-5 py-3 border-t border-white/5 bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-slate-600">Quick Actions (uses default level)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map(qp => (
              <button
                key={qp.id}
                onClick={() => handleQuickSelect(qp)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-white/5 hover:border-purple-500/30 transition-all"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Level Selection Modal */}
      <PromptLevelModal
        isOpen={showLevelModal}
        onClose={() => setShowLevelModal(false)}
        prompt={selectedPrompt}
        onSelect={handleLevelSelect}
        defaultLevel={defaultLevel}
        onSetDefaultLevel={setDefaultLevel}
      />
    </div>
  );
};

// Quick dropdown for inline prompt selection
interface PromptDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenLibrary: () => void;
}

export const PromptDropdown: React.FC<PromptDropdownProps> = ({ isOpen, onClose, onSelectPrompt, onOpenLibrary }) => {
  const [defaultLevel, setDefaultLevel] = usePromptLevel();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to close dropdown */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="absolute bottom-full left-0 mb-2 w-72 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150 z-50"
        onClick={e => e.stopPropagation()}
      >
        {/* Prompt Level Toggle */}
        <div className="p-3 border-b border-white/5 bg-slate-950/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Prompt Level</span>
            <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />
          </div>
        </div>

        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] text-slate-600 px-2 py-1 font-medium uppercase tracking-wide">Quick Prompts</p>
          {quickPrompts.map(qp => (
            <button
              key={qp.id}
              onClick={() => {
                onSelectPrompt(qp[defaultLevel]);
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors group"
            >
              <span className="text-sm text-slate-300 group-hover:text-white">{qp.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-purple-400 flex-shrink-0" />
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-white/5">
          <button
            onClick={() => {
              onOpenLibrary();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-medium transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Browse All Prompts
          </button>
        </div>
      </div>
    </>
  );
};
