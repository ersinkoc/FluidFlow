/**
 * Storage Constants
 *
 * Database names, keys, and storage-related constants.
 */

// IndexedDB
export const WIP_DB_NAME = 'fluidflow-wip';
export const WIP_DB_VERSION = 1;
export const WIP_STORE_NAME = 'wip';

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
} as const;

// Context IDs
export const CONTEXT_IDS = {
  MAIN_CHAT: 'main-chat',
  PROMPT_IMPROVER: 'prompt-improver',
  GIT_COMMIT: 'git-commit',
  QUICK_EDIT: 'quick-edit',
} as const;
