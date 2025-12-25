/**
 * Context Types
 *
 * Type definitions for conversation context management.
 */

/**
 * A single message in a conversation context
 */
export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * A conversation context containing messages and metadata
 */
export interface ConversationContext {
  id: string;
  name: string;
  messages: ContextMessage[];
  createdAt: number;
  lastUpdatedAt: number;
  metadata?: Record<string, unknown>;
  /** Token estimate for context management */
  estimatedTokens: number;
}

/**
 * Configuration for the context manager
 */
export interface ContextManagerConfig {
  /** Minimum remaining tokens before compaction is triggered */
  minRemainingTokens: number;
  /** Target tokens after compaction */
  compactToTokens: number;
  /** Whether to save to localStorage */
  persistToStorage: boolean;
  /** localStorage key */
  storageKey: string;
}

/**
 * Predefined context IDs for different features
 */
export const CONTEXT_IDS = {
  MAIN_CHAT: 'main-chat',
  PROMPT_IMPROVER: 'prompt-improver',
  GIT_COMMIT: 'git-commit',
  DB_STUDIO: 'db-studio',
  CODE_REVIEW: 'code-review',
  QUICK_EDIT: 'quick-edit',
} as const;

export type ContextId = (typeof CONTEXT_IDS)[keyof typeof CONTEXT_IDS];
