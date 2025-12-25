/**
 * Compaction Types
 *
 * Type definitions for context compaction operations.
 */

/**
 * Result of a compaction operation
 */
export interface CompactionResult {
  /** Whether compaction was performed */
  compacted: boolean;
  /** Token count before compaction */
  beforeTokens: number;
  /** Token count after compaction */
  afterTokens: number;
  /** Number of messages that were summarized */
  messagesSummarized: number;
  /** The generated summary (if compaction was performed) */
  summary?: string;
}

/**
 * Information about a context for compaction confirmation
 */
export interface CompactionInfo {
  /** Current token count */
  currentTokens: number;
  /** Percentage of token limit used */
  utilizationPercent: number;
  /** Number of messages in context */
  messageCount: number;
  /** Target token count after compaction */
  targetTokens: number;
  /** Human-readable message for confirmation dialog */
  message: string;
}

/**
 * Context statistics for display
 */
export interface ContextStats {
  /** Current token count */
  currentTokens: number;
  /** Remaining tokens before compaction is needed */
  remainingTokens: number;
  /** Minimum remaining tokens threshold */
  minRemainingTokens: number;
  /** Model's total context window size */
  modelContextSize: number;
  /** Target token count after compaction */
  target: number;
  /** Number of messages in context */
  messageCount: number;
  /** Whether compaction is needed */
  needsCompaction: boolean;
  /** Percentage of context used */
  utilizationPercent: number;
}

/**
 * Result of token space check
 */
export interface TokenSpaceResult {
  /** Whether there's enough space to proceed */
  canProceed: boolean;
  /** Whether compaction was performed */
  compacted: boolean;
  /** Reason if cannot proceed */
  reason?: string;
}
