// Mega Settings Modal Type Definitions
import { LucideIcon } from 'lucide-react';

// Settings Categories
export type SettingsCategory =
  | 'ai-providers'
  | 'ai-usage'
  | 'context-manager'
  | 'tech-stack'
  | 'projects'
  | 'prompt-templates'
  | 'editor'
  | 'appearance'
  | 'github'
  | 'debug'
  | 'shortcuts'
  | 'advanced'
  | 'about';

export interface SettingsCategoryConfig {
  id: SettingsCategory;
  label: string;
  icon: LucideIcon;
  description: string;
  badge?: string;
}

// Modal Props
export interface MegaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategory;
  onProviderChange?: (providerId: string, modelId: string) => void;
}

// Panel Props
export interface SettingsPanelProps {
  isActive: boolean;
}

// Editor Settings - Actually used by CodeEditor
export interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: 'on' | 'off' | 'wordWrapColumn';
  minimap: boolean;
  lineNumbers: 'on' | 'off' | 'relative';
  bracketPairColorization: boolean;
  formatOnPaste: boolean;
  formatOnSave: boolean;
  theme: 'vs-dark' | 'vs' | 'hc-black';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  cursorStyle: 'line' | 'block' | 'underline';
  smoothScrolling: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'on',
  minimap: false,
  lineNumbers: 'on',
  bracketPairColorization: true,
  formatOnPaste: false,
  formatOnSave: false,
  theme: 'vs-dark',
  cursorBlinking: 'smooth',
  cursorStyle: 'line',
  smoothScrolling: true,
};

// Debug Settings - Used by DebugPanel
export interface DebugSettings {
  enabled: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  maxLogs: number;
  persistLogs: boolean;
  showTokenUsage: boolean;
  showGenerationTime: boolean;
  showNetworkRequests: boolean;
}

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  enabled: false,
  logLevel: 'info',
  maxLogs: 500,
  persistLogs: false,
  showTokenUsage: true,
  showGenerationTime: true,
  showNetworkRequests: true,
};

// Storage Keys - Only for settings that are actually persisted and used
export const STORAGE_KEYS = {
  EDITOR_SETTINGS: 'fluidflow_editor_settings',
  DEBUG_SETTINGS: 'fluidflow_debug_settings',
} as const;
