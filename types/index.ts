// Shared types for FluidFlow application

export type FileSystem = Record<string, string>;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  label: string;
  files: FileSystem;
}

// File change tracking
export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

// Chat message types
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatAttachment {
  type: 'sketch' | 'brand';
  file: File;
  preview: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  timestamp: number;
  // User message
  prompt?: string;
  attachments?: ChatAttachment[];
  // Assistant message
  explanation?: string;
  files?: FileSystem;
  fileChanges?: FileChange[];
  // For reverting
  snapshotFiles?: FileSystem;
  isGenerating?: boolean;
  error?: string;
}

export interface AccessibilityIssue {
  type: 'error' | 'warning';
  message: string;
}

export interface AccessibilityReport {
  score: number;
  issues: AccessibilityIssue[];
}

export interface LogEntry {
  id: string;
  type: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
  isFixing?: boolean;
  isFixed?: boolean;
}

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number | string;
  duration: number;
  timestamp: string;
}

export interface PushResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Device types for preview
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type TabType = 'preview' | 'code' | 'database' | 'tests' | 'docs' | 'env' | 'debug';
export type TerminalTab = 'console' | 'network';

// AI Model types
export type ModelTier = 'fast' | 'pro';

export interface ModelConfig {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
}

// Code generation models only
export const AI_MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tier: 'fast',
    description: 'Fast & cost-effective'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tier: 'pro',
    description: 'Best for complex tasks'
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    tier: 'pro',
    description: 'Best for complex tasks'
  }
];

// Debug types
export interface DebugLogEntry {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'stream' | 'error' | 'info';
  category: 'generation' | 'accessibility' | 'quick-edit' | 'auto-fix' | 'other';
  model?: string;
  duration?: number;
  // Request data
  prompt?: string;
  systemInstruction?: string;
  attachments?: { type: string; size: number }[];
  // Response data
  response?: string;
  tokenCount?: {
    input?: number;
    output?: number;
  };
  // Error data
  error?: string;
  // Metadata
  metadata?: Record<string, unknown>;
}

export interface DebugState {
  enabled: boolean;
  logs: DebugLogEntry[];
  maxLogs: number;
  filter: {
    types: DebugLogEntry['type'][];
    categories: DebugLogEntry['category'][];
    searchQuery: string;
  };
}
