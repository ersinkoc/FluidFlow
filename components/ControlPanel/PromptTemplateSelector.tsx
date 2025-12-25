import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Star, ChevronRight, Search, X, Settings, Sparkles,
  Edit3, Wrench, MessageCircle, Layers
} from 'lucide-react';
import {
  PromptTemplate,
  PromptTemplateCategory,
  getPromptTemplates,
  getFavoriteTemplates,
  searchPromptTemplates,
  incrementTemplateUsage,
  applyVariablesToPrompt,
} from '@/services/promptTemplateStorage';

const CATEGORY_ICONS: Record<PromptTemplateCategory, typeof Sparkles> = {
  generation: Sparkles,
  edit: Edit3,
  fix: Wrench,
  chat: MessageCircle,
  custom: Layers,
};

const CATEGORY_COLORS: Record<PromptTemplateCategory, string> = {
  generation: 'text-purple-400',
  edit: 'text-blue-400',
  fix: 'text-orange-400',
  chat: 'text-green-400',
  custom: 'text-slate-400',
};

interface VariableInputModalProps {
  template: PromptTemplate;
  onApply: (prompt: string) => void;
  onCancel: () => void;
}

const VariableInputModal: React.FC<VariableInputModalProps> = ({ template, onApply, onCancel }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    template.variables.forEach(v => {
      initial[v.name] = v.defaultValue || '';
    });
    return initial;
  });

  const handleApply = () => {
    const result = applyVariablesToPrompt(template.prompt, values);
    incrementTemplateUsage(template.id);
    onApply(result);
  };

  const allFilled = template.variables.every(v => values[v.name]?.trim());

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <FileText className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{template.name}</h3>
              <p className="text-xs text-slate-500">Fill in the variables</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Variables */}
        <div className="p-5 space-y-4">
          {template.variables.map((variable) => (
            <div key={variable.name}>
              <label className="block text-xs text-slate-400 mb-1.5">
                {variable.name}
                {variable.description && (
                  <span className="text-slate-600 ml-1">- {variable.description}</span>
                )}
              </label>
              <input
                type="text"
                value={values[variable.name] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                placeholder={variable.defaultValue || `Enter ${variable.name}...`}
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          ))}

          {/* Preview */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Preview</label>
            <div className="p-3 bg-slate-800/50 border border-white/5 rounded-lg text-xs text-slate-300 font-mono max-h-32 overflow-y-auto">
              {applyVariablesToPrompt(template.prompt, values)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/5 bg-slate-950/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!allFilled}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use Template
          </button>
        </div>
      </div>
    </div>
  );
};

interface PromptTemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenSettings?: () => void;
}

export const PromptTemplateSelector: React.FC<PromptTemplateSelectorProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
  onOpenSettings,
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTemplates(getPromptTemplates());
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredTemplates = useMemo(() => {
    let result = searchQuery ? searchPromptTemplates(searchQuery) : templates;
    if (showFavoritesOnly) {
      result = result.filter(t => t.isFavorite);
    }
    return result.slice(0, 10); // Limit to 10 in dropdown
  }, [templates, searchQuery, showFavoritesOnly]);

  const favorites = useMemo(() => getFavoriteTemplates().slice(0, 5), [templates]);

  const handleSelect = (template: PromptTemplate) => {
    if (template.variables.length > 0) {
      setSelectedTemplate(template);
    } else {
      incrementTemplateUsage(template.id);
      onSelectPrompt(template.prompt);
      onClose();
    }
  };

  const handleVariableApply = (prompt: string) => {
    onSelectPrompt(prompt);
    setSelectedTemplate(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <div
        className="absolute bottom-full left-0 mb-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150 z-50"
        onClick={e => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-800/50 border border-white/5 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
              autoFocus
            />
          </div>
        </div>

        {/* Favorites */}
        {!searchQuery && favorites.length > 0 && (
          <div className="p-2 border-b border-white/5">
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 uppercase tracking-wide">
              <Star className="w-3 h-3 text-yellow-500" />
              Favorites
            </div>
            {favorites.map(template => {
              const Icon = CATEGORY_ICONS[template.category];
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <Icon className={`w-3.5 h-3.5 ${CATEGORY_COLORS[template.category]}`} />
                  <span className="flex-1 text-xs text-slate-300 group-hover:text-white text-left truncate">
                    {template.name}
                  </span>
                  {template.variables.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                      {template.variables.length} var
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-purple-400" />
                </button>
              );
            })}
          </div>
        )}

        {/* All Templates */}
        <div className="p-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">
              {searchQuery ? 'Results' : 'All Templates'}
            </span>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`p-1 rounded transition-colors ${
                showFavoritesOnly ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'
              }`}
              title="Show favorites only"
            >
              <Star className="w-3 h-3" fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            </button>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">
              {searchQuery ? 'No templates found' : 'No templates yet'}
            </div>
          ) : (
            filteredTemplates.map(template => {
              const Icon = CATEGORY_ICONS[template.category];
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <Icon className={`w-3.5 h-3.5 ${CATEGORY_COLORS[template.category]}`} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-300 group-hover:text-white truncate">
                        {template.name}
                      </span>
                      {template.isFavorite && (
                        <Star className="w-2.5 h-2.5 text-yellow-500 flex-shrink-0" fill="currentColor" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 truncate">{template.description}</p>
                  </div>
                  {template.variables.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
                      {template.variables.length} var
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-purple-400 flex-shrink-0" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-white/5 bg-slate-950/50">
          <button
            onClick={() => {
              onOpenSettings?.();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Manage Templates
          </button>
        </div>
      </div>

      {/* Variable Input Modal */}
      {selectedTemplate && (
        <VariableInputModal
          template={selectedTemplate}
          onApply={handleVariableApply}
          onCancel={() => setSelectedTemplate(null)}
        />
      )}
    </>
  );
};

export default PromptTemplateSelector;
