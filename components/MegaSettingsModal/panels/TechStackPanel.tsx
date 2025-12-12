import React, { useState, useEffect } from 'react';
import { Package, Check, Info } from 'lucide-react';
import { TechStackConfig, TECH_STACK_OPTIONS, DEFAULT_TECH_STACK } from '../../../types';

const STORAGE_KEY = 'fluidflow-tech-stack';

type TechCategory = keyof TechStackConfig;

const CATEGORY_INFO: Record<TechCategory, { label: string; description: string }> = {
  styling: { label: 'Styling', description: 'CSS framework or styling approach' },
  icons: { label: 'Icons', description: 'Icon library for UI elements' },
  stateManagement: { label: 'State Management', description: 'How to manage application state' },
  routing: { label: 'Routing', description: 'Navigation and URL handling' },
  dataFetching: { label: 'Data Fetching', description: 'HTTP client and data loading' },
  forms: { label: 'Forms', description: 'Form handling and validation' },
  animations: { label: 'Animations', description: 'Motion and transitions' },
  testing: { label: 'Testing', description: 'Testing framework and utilities' }
};

export const TechStackPanel: React.FC = () => {
  const [techStack, setTechStack] = useState<TechStackConfig>(DEFAULT_TECH_STACK);
  const [selectedCategory, setSelectedCategory] = useState<TechCategory>('styling');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setTechStack({ ...DEFAULT_TECH_STACK, ...JSON.parse(saved) });
      } catch {
        setTechStack(DEFAULT_TECH_STACK);
      }
    }
  }, []);

  const updateTechStack = (category: TechCategory, library: string) => {
    const updated = {
      ...techStack,
      [category]: { library, version: 'latest' }
    };
    setTechStack(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const options = TECH_STACK_OPTIONS[selectedCategory] || [];

  return (
    <div className="flex h-full">
      {/* Category List - Left */}
      <div className="w-48 border-r border-white/5 flex flex-col bg-slate-950/30">
        <div className="p-3 border-b border-white/5">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Categories</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {(Object.entries(CATEGORY_INFO) as [TechCategory, { label: string; description: string }][]).map(([key, info]) => {
            const isSelected = selectedCategory === key;
            const currentValue = techStack[key]?.library || 'none';
            const option = TECH_STACK_OPTIONS[key]?.find(o => o.value === currentValue);

            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`w-full p-2.5 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-white/10 border border-white/20'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="text-sm text-white">{info.label}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {option?.label || 'None'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Options - Right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{CATEGORY_INFO[selectedCategory].label}</h2>
              <p className="text-xs text-slate-400">{CATEGORY_INFO[selectedCategory].description}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Info Box */}
          <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-4">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Selected technologies will be used as defaults when generating new code.
              The AI will follow these preferences unless you specify otherwise.
            </p>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3">
            {options.map(option => {
              const isSelected = techStack[selectedCategory]?.library === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => updateTechStack(selectedCategory, option.value)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-500/20 border-blue-500/30'
                      : 'bg-slate-800/50 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-white">{option.label}</div>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">
                          {option.version}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{option.description}</div>
                    </div>
                    {isSelected && (
                      <div className="p-1 bg-blue-500 rounded-full flex-shrink-0 ml-2">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Stack Summary */}
        <div className="p-3 border-t border-white/5 bg-slate-950/30">
          <div className="text-xs text-slate-500 mb-2">Current Stack:</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(techStack) as [TechCategory, { library: string; version: string }][])
              .filter(([_, val]) => val.library !== 'none')
              .map(([key, val]) => {
                const option = TECH_STACK_OPTIONS[key]?.find(o => o.value === val.library);
                return (
                  <span
                    key={key}
                    className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300"
                  >
                    {option?.label || val.library}
                  </span>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechStackPanel;
