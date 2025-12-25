/**
 * Storage Constants
 *
 * Database names, keys, and storage-related constants.
 */

// IndexedDB
export const WIP_DB_NAME = 'fluidflow-wip';
export const WIP_DB_VERSION = 2; // Bumped for chat store
export const WIP_STORE_NAME = 'wip';
export const CHAT_STORE_NAME = 'chat';

// Analytics IndexedDB
export const ANALYTICS_DB_NAME = 'fluidflow-analytics';
export const ANALYTICS_DB_VERSION = 1;
export const ANALYTICS_STORE_NAME = 'usage-records';

// LocalStorage keys
export const STORAGE_KEYS = {
  AI_PROVIDERS: 'ai-providers',
  ACTIVE_PROVIDER: 'active-provider',
  SELECTED_MODEL: 'selected-model',
  EDITOR_SETTINGS: 'editor-settings',
  TECH_STACK: 'tech-stack',
  DIFF_MODE_ENABLED: 'diffModeEnabled',
  HAS_VISITED: 'fluidflow-visited',
  DEBUG_MODE: 'debug-mode',
  THEME: 'theme',
  CONTEXTS: 'fluidflow_contexts',
  PROMPT_CONFIRMATION: 'prompt-confirmation-enabled',
  FILE_CONTEXT_ENABLED: 'file-context-delta-enabled',
} as const;

// Context IDs
export const CONTEXT_IDS = {
  MAIN_CHAT: 'main-chat',
  PROMPT_IMPROVER: 'prompt-improver',
  GIT_COMMIT: 'git-commit',
  QUICK_EDIT: 'quick-edit',
} as const;
