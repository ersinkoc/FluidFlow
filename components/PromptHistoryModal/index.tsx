/**
 * Prompt History Modal
 *
 * Shows user's prompt history with search, favorites, and reuse functionality
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Star,
  Search,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  X,
  Tag,
  TrendingUp,
  Heart,
  FileText,
} from 'lucide-react';
import { ConfirmModal } from '../ContextIndicator/ConfirmModal';
import { useToast } from '../Toast/ToastContext';
import {
  getPromptHistory,
  deletePromptFromHistory,
  togglePromptFavorite,
  searchPromptHistory,
  getFavoritePrompts,
  getRecentPrompts,
  getPromptHistoryStats,
  clearPromptHistory,
  exportPromptHistory,
  importPromptHistory,
  type PromptHistoryItem,
} from '@/services/promptHistory';

export interface PromptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const PromptHistoryModal: React.FC<PromptHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
}) => {
  const [prompts, setPrompts] = useState<PromptHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [stats, setStats] = useState(getPromptHistoryStats());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const { success, error } = useToast();

  // Load prompts on mount
  const loadPrompts = useCallback(() => {
    switch (filter) {
      case 'favorites':
        setPrompts(getFavoritePrompts());
        break;
      case 'recent':
        setPrompts(getRecentPrompts(7));
        break;
      default:
        setPrompts(getPromptHistory());
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) {
      loadPrompts();
      setStats(getPromptHistoryStats());
    }
  }, [isOpen, loadPrompts]);

  // Filter by search query
  const filteredPrompts = useMemo(() => {
    if (!searchQuery.trim()) return prompts;
    return searchPromptHistory(searchQuery).filter(p => prompts.some(item => item.id === p.id));
  }, [prompts, searchQuery]);

  // Group by date
  const groupedPrompts = useMemo(() => {
    const groups: Record<string, PromptHistoryItem[]> = {};

    for (const prompt of filteredPrompts) {
      const date = new Date(prompt.timestamp);
      const key = getDateKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(prompt);
    }

    return groups;
  }, [filteredPrompts]);

  function getDateKey(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  }

  function handleToggleFavorite(id: string) {
    togglePromptFavorite(id);
    loadPrompts();
    setStats(getPromptHistoryStats());
  }

  function handleDelete(id: string) {
    setShowDeleteConfirm(id);
  }

  function performDelete() {
    if (showDeleteConfirm) {
      deletePromptFromHistory(showDeleteConfirm);
      loadPrompts();
      setStats(getPromptHistoryStats());
      setShowDeleteConfirm(null);
    }
  }

  function handleSelect(prompt: string) {
    onSelectPrompt(prompt);
    onClose();
  }

  function handleExport() {
    const json = exportPromptHistory();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      const result = importPromptHistory(text);

      if (result.success) {
        loadPrompts();
        setStats(getPromptHistoryStats());
        success(`Imported ${result.imported} prompts`);
      } else {
        error(`Import failed: ${result.error}`);
      }
    };
    input.click();
  }

  function handleClearAll() {
    setShowClearAllConfirm(true);
  }

  function performClearAll() {
    clearPromptHistory();
    loadPrompts();
    setStats(getPromptHistoryStats());
    setShowClearAllConfirm(false);
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getPromptPreview(prompt: string): string {
    return prompt.length > 150 ? prompt.substring(0, 150) + '...' : prompt;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-purple-500/10 to-blue-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Prompt History</h2>
                <p className="text-xs text-slate-400">{stats.totalPrompts} prompts saved</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="flex items-center gap-2 text-xs">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="text-slate-400">{stats.favoriteCount} favorites</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">{stats.thisWeekCount} this week</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Tag className="w-4 h-4 text-blue-400" />
              <span className="text-slate-400">{stats.mostUsedTags.slice(0, 3).join(', ') || 'No tags'}</span>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('favorites')}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  filter === 'favorites'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <Star className="w-4 h-4 inline mr-1" />
                Favorites
              </button>
              <button
                onClick={() => setFilter('recent')}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  filter === 'recent'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Recent
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                title="Import history"
              >
                <Upload className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={handleExport}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                title="Export history"
              >
                <Download className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={handleClearAll}
                className="p-2 bg-slate-800 hover:bg-red-500/20 rounded-lg transition-colors"
                title="Clear all history"
              >
                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Prompt List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <FileText className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No prompts match your search' : 'No prompts saved yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPrompts).map(([dateKey, items]) => (
                <div key={dateKey}>
                  <h3 className="text-xs font-medium text-slate-500 mb-2 px-2">{dateKey}</h3>
                  <div className="space-y-2">
                    {items.map((prompt) => (
                      <div
                        key={prompt.id}
                        className="p-4 bg-slate-800/50 border border-white/5 rounded-lg hover:border-white/10 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">
                              {getPromptPreview(prompt.prompt)}
                            </p>
                            {prompt.responsePreview && (
                              <p className="text-xs text-slate-500 mt-2 italic">
                                Response: {prompt.responsePreview}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span>{formatTime(prompt.timestamp)}</span>
                              {prompt.model && (
                                <span className="px-2 py-0.5 bg-slate-700 rounded">{prompt.model}</span>
                              )}
                              {prompt.tokensUsed && (
                                <span>{prompt.tokensUsed.toLocaleString()} tokens</span>
                              )}
                              {prompt.tags?.map((tag) => (
                                <span key={tag} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleToggleFavorite(prompt.id)}
                              className={`p-2 rounded-lg transition-colors ${
                                prompt.favorite
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-slate-700 text-slate-400 hover:text-yellow-400'
                              }`}
                              title={prompt.favorite ? 'Remove favorite' : 'Add favorite'}
                            >
                              <Star className={`w-4 h-4 ${prompt.favorite ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleSelect(prompt.prompt)}
                              className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                              title="Reuse this prompt"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(prompt.id)}
                              className="p-2 bg-slate-700 text-slate-400 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        onClose={() => setShowDeleteConfirm(null)}
        onConfirm={performDelete}
        title="Delete Prompt"
        message="This will permanently delete this prompt from your history. This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
      />

      {/* Clear All Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={performClearAll}
        title="Clear All Prompt History"
        message="This will permanently delete all your saved prompt history. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />
    </div>
  );
};

export default PromptHistoryModal;
