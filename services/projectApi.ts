/**
 * FluidFlow Backend API Client
 * Handles communication with the backend server for project management, git, and GitHub operations
 */

// Use relative URL - Vite proxies /api to backend (avoids mixed content with HTTPS frontend)
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Types
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  gitInitialized?: boolean;
  githubRepo?: string;
}

export interface Project extends ProjectMeta {
  files: Record<string, string>;
}

// Response type for project update
export interface ProjectUpdateResponse extends ProjectMeta {
  message?: string;
  warning?: string;
  blocked?: boolean;
  confirmationRequired?: boolean;
  existingFileCount?: number;
  newFileCount?: number;
}

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

// Project context (version history + UI state)
export interface HistoryEntry {
  files: Record<string, string>;
  label: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'snapshot';
  changedFiles?: string[];
}

// AI Generation history entry
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
  // Template type for special prompt templates (auto-fix, inspect-edit, checkpoint, etc.)
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

export interface GitRemote {
  name: string;
  fetch: string;
  push: string;
}

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

// Helper for API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.details || 'API request failed');
  }

  return data;
}

// ============ PROJECT API ============

export const projectApi = {
  /**
   * List all projects
   */
  list: () => apiCall<ProjectMeta[]>('/projects'),

  /**
   * Get a single project with files
   */
  get: (id: string) => apiCall<Project>(`/projects/${id}`),

  /**
   * Create a new project
   */
  create: (data: { name?: string; description?: string; files?: Record<string, string> }) =>
    apiCall<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a project (auto-save)
   * @param force - If true, bypass confirmation checks for large file reductions
   */
  update: (id: string, data: { name?: string; description?: string; files?: Record<string, string>; force?: boolean }) =>
    apiCall<ProjectUpdateResponse>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a project
   */
  delete: (id: string) =>
    apiCall<{ message: string; id: string }>(`/projects/${id}`, {
      method: 'DELETE',
    }),

  /**
   * Duplicate a project
   */
  duplicate: (id: string, name?: string) =>
    apiCall<ProjectMeta>(`/projects/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /**
   * Get project context (version history + UI state)
   */
  getContext: (id: string) =>
    apiCall<ProjectContext>(`/projects/${id}/context`),

  /**
   * Save project context
   */
  saveContext: (id: string, context: Partial<ProjectContext>) =>
    apiCall<{ message: string; savedAt: number }>(`/projects/${id}/context`, {
      method: 'PUT',
      body: JSON.stringify(context),
    }),

  /**
   * Clear project context
   */
  clearContext: (id: string) =>
    apiCall<{ message: string }>(`/projects/${id}/context`, {
      method: 'DELETE',
    }),
};

// ============ GIT API ============

export const gitApi = {
  /**
   * Initialize git in a project
   * @param projectId - The project ID
   * @param force - If true, delete existing .git and reinitialize (for corrupted repos)
   */
  init: (projectId: string, force = false) =>
    apiCall<{ message: string; initialized: boolean }>(`/git/${projectId}/init`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),

  /**
   * Get git status
   */
  status: (projectId: string) => apiCall<GitStatus>(`/git/${projectId}/status`),

  /**
   * Get commit log
   */
  log: (projectId: string, limit = 20) =>
    apiCall<{ initialized: boolean; commits: GitCommit[] }>(`/git/${projectId}/log?limit=${limit}`),

  /**
   * Create a commit
   */
  commit: (projectId: string, message: string, files?: Record<string, string>) =>
    apiCall<{ message: string; commit?: { hash: string; summary: any }; clean?: boolean }>(`/git/${projectId}/commit`, {
      method: 'POST',
      body: JSON.stringify({ message, files }),
    }),

  /**
   * Get diff
   */
  diff: (projectId: string, cached = false) =>
    apiCall<{ diff: string }>(`/git/${projectId}/diff?cached=${cached}`),

  /**
   * Checkout to a commit
   */
  checkout: (projectId: string, commit: string) =>
    apiCall<{ message: string }>(`/git/${projectId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ commit }),
    }),

  /**
   * Create a branch
   */
  createBranch: (projectId: string, name: string, checkout = true) =>
    apiCall<{ message: string; checkout: boolean }>(`/git/${projectId}/branch`, {
      method: 'POST',
      body: JSON.stringify({ name, checkout }),
    }),

  /**
   * List branches
   */
  branches: (projectId: string) =>
    apiCall<{ initialized: boolean; current?: string; branches: string[] }>(`/git/${projectId}/branches`),

  /**
   * Get commit details (changed files, stats)
   */
  commitDetails: (projectId: string, hash: string) =>
    apiCall<CommitDetails>(`/git/${projectId}/commit/${hash}`),

  /**
   * Get diff for a specific commit
   */
  commitDiff: (projectId: string, hash: string, file?: string) =>
    apiCall<{ diff: string; hash: string; file: string | null }>(
      `/git/${projectId}/commit/${hash}/diff${file ? `?file=${encodeURIComponent(file)}` : ''}`
    ),

  /**
   * Get file content at specific commit
   */
  fileAtCommit: (projectId: string, hash: string, filePath: string) =>
    apiCall<{ content: string | null; path: string; hash: string; notFound?: boolean }>(
      `/git/${projectId}/commit/${hash}/file?path=${encodeURIComponent(filePath)}`
    ),
};

// ============ GITHUB API ============

export const githubApi = {
  /**
   * Verify GitHub token
   */
  verifyToken: (token: string) =>
    apiCall<{ valid: boolean; user?: GitHubUser; error?: string }>('/github/verify-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  /**
   * Clone a repository
   */
  clone: (url: string, name?: string) =>
    apiCall<{ message: string; project: ProjectMeta }>('/github/clone', {
      method: 'POST',
      body: JSON.stringify({ url, name }),
    }),

  /**
   * Set remote origin
   */
  setRemote: (projectId: string, url: string, name = 'origin') =>
    apiCall<{ message: string }>(`/github/${projectId}/remote`, {
      method: 'POST',
      body: JSON.stringify({ url, name }),
    }),

  /**
   * Get remotes
   */
  getRemotes: (projectId: string) =>
    apiCall<{ initialized: boolean; remotes: GitRemote[] }>(`/github/${projectId}/remote`),

  /**
   * Push to remote
   */
  push: (projectId: string, options?: { remote?: string; branch?: string; force?: boolean }) =>
    apiCall<{ message: string; remote: string; branch: string }>(`/github/${projectId}/push`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  /**
   * Pull from remote
   */
  pull: (projectId: string, options?: { remote?: string; branch?: string }) =>
    apiCall<{ message: string; summary: any }>(`/github/${projectId}/pull`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  /**
   * Fetch from remote
   */
  fetch: (projectId: string, options?: { remote?: string; prune?: boolean }) =>
    apiCall<{ message: string }>(`/github/${projectId}/fetch`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  /**
   * Create a GitHub repository
   */
  createRepo: (projectId: string, token: string, options?: { name?: string; description?: string; isPrivate?: boolean }) =>
    apiCall<{ message: string; repository: GitHubRepo }>(`/github/${projectId}/create-repo`, {
      method: 'POST',
      body: JSON.stringify({ token, ...options }),
    }),
};

// ============ AUTO-SAVE UTILITY ============

// Thread-safe auto-save state
let autoSaveTimeout: NodeJS.Timeout | null = null;
let lastSavedFiles: string | null = null;
let lastSavedProjectId: string | null = null;
let isSaving = false;  // Lock to prevent concurrent saves
let pendingSave: { projectId: string; files: Record<string, string> } | null = null;

// Internal save function that handles the lock
// BUG-006 fix: Merge pending saves to prevent lost updates
async function performSave(projectId: string, files: Record<string, string>): Promise<boolean> {
  // If already saving, merge this save with pending
  if (isSaving) {
    if (pendingSave) {
      // BUG-006 fix: Merge files instead of overwriting to prevent data loss
      // If project changed, start fresh; otherwise merge
      if (pendingSave.projectId === projectId) {
        pendingSave.files = { ...pendingSave.files, ...files };
        console.log('[AutoSave] Save merged with existing pending save');
      } else {
        // Different project - replace (can't merge across projects)
        pendingSave = { projectId, files };
        console.log('[AutoSave] Save queued (different project)');
      }
    } else {
      pendingSave = { projectId, files };
      console.log('[AutoSave] Save queued (another save in progress)');
    }
    return false;
  }

  isSaving = true;
  const filesJson = JSON.stringify(files);

  try {
    await projectApi.update(projectId, { files });
    lastSavedFiles = filesJson;
    lastSavedProjectId = projectId;
    console.log('[AutoSave] Project saved');
    return true;
  } catch (error) {
    console.error('[AutoSave] Failed to save:', error);
    return false;
  } finally {
    isSaving = false;
    // Process any queued save
    const queued = pendingSave;
    if (queued) {
      pendingSave = null;
      // Use setTimeout to avoid stack overflow on rapid saves
      setTimeout(() => performSave(queued.projectId, queued.files), 0);
    }
  }
}

export const autoSave = {
  /**
   * Schedule an auto-save (debounced, thread-safe)
   */
  schedule: (projectId: string, files: Record<string, string>, delay = 2000) => {
    const filesJson = JSON.stringify(files);

    // Skip if nothing changed (same project and same content)
    if (filesJson === lastSavedFiles && projectId === lastSavedProjectId) {
      return;
    }

    // If project changed, reset state to ensure we save to the correct project
    if (projectId !== lastSavedProjectId) {
      lastSavedFiles = null;
    }

    // Clear existing timeout
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = null;
    }

    // Schedule new save
    autoSaveTimeout = setTimeout(() => {
      autoSaveTimeout = null;  // Clear ref before async operation
      performSave(projectId, files);
    }, delay);
  },

  /**
   * Force save immediately (thread-safe)
   */
  saveNow: async (projectId: string, files: Record<string, string>) => {
    // Clear any pending scheduled save
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = null;
    }

    // If project changed, reset state
    if (projectId !== lastSavedProjectId) {
      lastSavedFiles = null;
    }

    const result = await performSave(projectId, files);
    if (result) {
      console.log('[AutoSave] Project saved (forced)');
    }
    return result;
  },

  /**
   * Reset auto-save state
   */
  reset: () => {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = null;
    }
    lastSavedFiles = null;
    lastSavedProjectId = null;
    pendingSave = null;
    // Note: We don't reset isSaving here as an in-flight save should complete
  },

  /**
   * Check if a save is currently in progress
   */
  isSaving: () => isSaving,
};

// ============ HEALTH CHECK ============

export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

// ============ SETTINGS API ============

// Storage type for AI providers - flexible to store full runtime config
// JSON preserves full object structure, so we use a flexible type here
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

export interface GlobalSettings {
  aiProviders: StoredProviderConfig[];
  activeProviderId: string;
  customSnippets: CustomSnippet[];
  updatedAt: number;
}

export const settingsApi = {
  /**
   * Get all settings
   */
  get: () => apiCall<GlobalSettings>('/settings'),

  /**
   * Update settings
   */
  update: (settings: Partial<GlobalSettings>) =>
    apiCall<{ message: string; updatedAt: number }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  /**
   * Get AI providers
   */
  getAIProviders: () =>
    apiCall<{ providers: StoredProviderConfig[]; activeId: string }>('/settings/ai-providers'),

  /**
   * Save AI providers
   */
  saveAIProviders: (providers: StoredProviderConfig[], activeId: string) =>
    apiCall<{ message: string; updatedAt: number }>('/settings/ai-providers', {
      method: 'PUT',
      body: JSON.stringify({ providers, activeId }),
    }),

  /**
   * Get custom snippets
   */
  getSnippets: () => apiCall<CustomSnippet[]>('/settings/snippets'),

  /**
   * Save all snippets
   */
  saveSnippets: (snippets: CustomSnippet[]) =>
    apiCall<{ message: string; updatedAt: number }>('/settings/snippets', {
      method: 'PUT',
      body: JSON.stringify({ snippets }),
    }),

  /**
   * Add a snippet
   */
  addSnippet: (snippet: { name: string; code: string; category?: string }) =>
    apiCall<CustomSnippet>('/settings/snippets', {
      method: 'POST',
      body: JSON.stringify(snippet),
    }),

  /**
   * Delete a snippet
   */
  deleteSnippet: (id: string) =>
    apiCall<{ message: string }>(`/settings/snippets/${id}`, {
      method: 'DELETE',
    }),
};

// ============ RUNNER API ============

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

export const runnerApi = {
  /**
   * List all running projects
   */
  list: () => apiCall<RunningProjectInfo[]>('/runner'),

  /**
   * Get status of a specific project
   */
  status: (projectId: string) => apiCall<RunningProjectInfo>(`/runner/${projectId}`),

  /**
   * Start a project (npm install + npm run dev)
   */
  start: (projectId: string) =>
    apiCall<{ message: string; port: number; url: string; status: string }>(`/runner/${projectId}/start`, {
      method: 'POST',
    }),

  /**
   * Stop a running project
   */
  stop: (projectId: string) =>
    apiCall<{ message: string; status: string }>(`/runner/${projectId}/stop`, {
      method: 'POST',
    }),

  /**
   * Get logs for a running project
   */
  logs: (projectId: string, since?: number) =>
    apiCall<{ logs: string[]; errorLogs: string[]; status: string; totalLogs: number }>(
      `/runner/${projectId}/logs${since ? `?since=${since}` : ''}`
    ),

  /**
   * Stop all running projects
   */
  stopAll: () =>
    apiCall<{ message: string; stopped: string[] }>('/runner/stop-all', {
      method: 'POST',
    }),

  /**
   * Cleanup orphan processes on runner ports
   */
  cleanup: () =>
    apiCall<{ message: string }>('/runner/cleanup', {
      method: 'POST',
    }),
};
