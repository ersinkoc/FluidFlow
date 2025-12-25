/**
 * FluidFlow Configuration Types
 *
 * Type definitions for FluidFlow project configuration.
 */

/**
 * AI Response format type
 * - json: Structured JSON response (more reliable for complex schemas)
 * - marker: Marker-based format (default, better streaming support)
 */
export type AIResponseFormat = 'json' | 'marker';

/**
 * Main FluidFlow configuration interface
 */
export interface FluidFlowConfig {
  /** Project-level AI instructions */
  rules?: string;
  /** Agent configurations */
  agents?: AgentConfig[];
  /** Context management settings */
  contextSettings?: ContextSettings;
  /** AI Response format (json or marker) - affects how AI returns code */
  responseFormat?: AIResponseFormat;
}

/**
 * Configuration for an AI agent
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  enabled: boolean;
}

/**
 * Context management settings
 */
export interface ContextSettings {
  /** Minimum remaining tokens before compaction is triggered */
  minRemainingTokens: number;
  /** Target token count after compaction */
  compactToTokens: number;
  /** Whether to auto-compact without confirmation */
  autoCompact: boolean;
  /** Whether to save compaction logs */
  saveCompactionLogs: boolean;
  /** @deprecated Use minRemainingTokens instead */
  maxTokensBeforeCompact?: number;
}

/**
 * Log entry for a context compaction event
 */
export interface CompactionLog {
  id: string;
  timestamp: number;
  contextId: string;
  beforeTokens: number;
  afterTokens: number;
  messagesSummarized: number;
  summary: string;
}
