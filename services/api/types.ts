/**
 * API Types
 *
 * Shared type definitions for all API modules.
 */

// ============================================================================
// Project Types
// ============================================================================

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  gitInitialized?: boolean;
  githubRepo?: string;
  /** First time the project was started/opened */
  firstStartAt?: number;
  /** Last commit timestamp */
  lastCommitAt?: number;
  /** Whether node_modules folder exists */
  hasNodeModules?: boolean;
  /** Size of node_modules in bytes */
  nodeModulesSize?: number;
}

export interface Project extends ProjectMeta {
  files: Record<string, string>;
}

export interface ProjectUpdateResponse extends ProjectMeta {
  message?: string;
  warning?: string;
  blocked?: boolean;
  confirmationRequired?: boolean;
  existingFileCount?: number;
  newFileCount?: number;
}

// ============================================================================
// Git Types
// ============================================================================

export interface GitStatus {
  initialized: boolean;
  branch?: string;
  clean?: boolean;
  staged?: string[];
  modified?: string[];
  not_added?: string[];
  deleted?: string[];
  ahead?: number;
  behind?: number;
  // Error states
  corrupted?: boolean;
  error?: string;
  message?: string;
}

export interface GitCommit {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  email: string;
  date: string;
}

export interface CommitFileChange {
  path: string;
  newPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown';
  statusCode: string;
}

export interface CommitDetails extends GitCommit {
  body?: string;
  files: CommitFileChange[];
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export interface GitRemote {
  name: string;
  fetch: string;
  push: string;
}

// ============================================================================
// GitHub Types
// ============================================================================

export interface GitHubUser {
  login: string;
  name: string;
  avatar: string;
  url: string;
}

export interface GitHubRepo {
  name: string;
  url: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
}

// ============================================================================
// Project Context Types
// ============================================================================

export interface HistoryEntry {
  files: Record<string, string>;
  label: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'snapshot';
  changedFiles?: string[];
}

export interface AIHistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  model: string;
  provider: string;
  // Request info
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  // Response info
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  durationMs: number;
  // Result
  success: boolean;
  error?: string;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  // Template type for special prompt templates
  templateType?: 'auto-fix' | 'inspect-edit' | 'prompt-template' | 'chat' | 'checkpoint';
}

export interface ProjectContext {
  history: HistoryEntry[];
  currentIndex: number;
  activeFile?: string;
  activeTab?: string;
  savedAt: number;
  // AI generation history
  aiHistory?: AIHistoryEntry[];
}

// ============================================================================
// Settings Types
// ============================================================================

export interface StoredProviderConfig {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  models?: unknown[]; // Can be ModelOption[] from AI types
  defaultModel?: string;
  isLocal?: boolean;
  headers?: Record<string, string>;
}

export interface CustomSnippet {
  id: string;
  name: string;
  code: string;
  category: string;
  createdAt: number;
}

export interface GitHubBackupSettings {
  enabled: boolean;
  branchName: string; // e.g., 'backup/auto'
  token?: string; // Encrypted GitHub PAT
  lastBackupAt?: number;
  lastBackupCommit?: string;
}

export interface GitHubPushSettings {
  includeProjectMetadata: boolean; // Always include project.json
  includeConversationHistory: boolean; // Include context.json (default false for privacy)
  defaultPrivate: boolean; // Create repos as private by default
}

export interface GlobalSettings {
  aiProviders: StoredProviderConfig[];
  activeProviderId: string;
  customSnippets: CustomSnippet[];
  githubBackup?: GitHubBackupSettings;
  updatedAt: number;
}

// ============================================================================
// Runner Types
// ============================================================================

export interface RunningProjectInfo {
  projectId: string;
  port: number;
  status: 'installing' | 'starting' | 'running' | 'error' | 'stopped';
  url: string;
  startedAt: number;
  running: boolean;
  logs?: string[];
  errorLogs?: string[];
  logsCount?: number;
  errorLogsCount?: number;
}
