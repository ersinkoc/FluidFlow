import React from 'react';
import {
  Cpu, MessageSquare, Package, FolderOpen, Code,
  Palette, Bug, Settings2
} from 'lucide-react';
import { SettingsCategory, SettingsCategoryConfig } from './types';

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

const SETTINGS_CATEGORIES: SettingsCategoryConfig[] = [
  {
    id: 'ai-providers',
    label: 'AI Providers',
    icon: Cpu,
    description: 'Configure AI models and API keys'
  },
  {
    id: 'context-manager',
    label: 'Context',
    icon: MessageSquare,
    description: 'Token limits and compaction'
  },
  {
    id: 'tech-stack',
    label: 'Tech Stack',
    icon: Package,
    description: 'Default libraries and frameworks'
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    description: 'Default project settings'
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: Code,
    description: 'Code editor preferences'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'UI theme and layout'
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: Bug,
    description: 'Debugging and monitoring'
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Settings2,
    description: 'Rules, agents, and more'
  }
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onCategoryChange
}) => {
  return (
    <div className="w-56 bg-slate-950/50 border-r border-white/5 flex flex-col">
      <div className="p-3 border-b border-white/5">
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Settings</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {SETTINGS_CATEGORIES.map(category => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;

          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                isActive
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{category.label}</div>
                <div className="text-[10px] text-slate-500 truncate">{category.description}</div>
              </div>
              {category.badge && (
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                  {category.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- Constant export for module API
export { SETTINGS_CATEGORIES };
export default SettingsSidebar;
