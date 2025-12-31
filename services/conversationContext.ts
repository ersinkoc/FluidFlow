/**
 * Conversation Context Manager
 *
 * Manages separate contexts for different features (prompt improver, git, db studio, etc.)
 *
 * @module services/conversationContext
 *
 * Structure:
 * - services/context/types.ts          - Type definitions
 * - services/context/tokenEstimation.ts - Token estimation utilities
 */

import {
  DEFAULT_MAX_TOKENS,
  COMPACTION_THRESHOLD_TOKENS,
  STREAMING_SAVE_DEBOUNCE_MS,
  STORAGE_KEYS,
} from '@/constants';

// Import and re-export types from context module
import type { ContextMessage, ConversationContext, ContextManagerConfig } from './context/types';
import { CONTEXT_IDS } from './context/types';
import { estimateTokens } from './context/tokenEstimation';

export type { ContextMessage, ConversationContext, ContextManagerConfig };
export { CONTEXT_IDS };

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ContextManagerConfig = {
  minRemainingTokens: DEFAULT_MAX_TOKENS, // Compact when less than 8k tokens remaining
  compactToTokens: COMPACTION_THRESHOLD_TOKENS, // Compact to ~2k tokens
  persistToStorage: true,
  storageKey: STORAGE_KEYS.CONTEXTS,
};

// ============================================================================
// ConversationContextManager Class
// ============================================================================

class ConversationContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private config: ContextManagerConfig;
  // AI-006 fix: Debounce streaming saves to prevent data loss
  private streamingSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  private loadFromStorage(): void {
    if (!this.config.persistToStorage) return;

    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ConversationContext[];
        let cleared = 0;

        parsed.forEach((ctx) => {
          // AUTO-CLEAR: If context has excessive tokens (>500k), clear it on load
          // This prevents token bloat from corrupted or stale contexts
          if (ctx.estimatedTokens > 500000) {
            console.log(`[ContextManager] ⚠️ Context "${ctx.id}" has ${ctx.estimatedTokens.toLocaleString()} tokens - clearing`);
            ctx.messages = [];
            ctx.estimatedTokens = 0;
            cleared++;
          }
          this.contexts.set(ctx.id, ctx);
        });

        console.log(`[ContextManager] Loaded ${parsed.length} contexts from storage${cleared > 0 ? ` (cleared ${cleared} oversized)` : ''}`);

        // Save back if we cleared any
        if (cleared > 0) {
          this.saveToStorage();
        }
      }
    } catch (e) {
      console.error('[ContextManager] Failed to load from storage:', e);
      // Clear corrupted data to prevent repeated failures
      try {
        localStorage.removeItem(this.config.storageKey);
        console.log('[ContextManager] Cleared corrupted storage data');
      } catch (removeError) {
        console.error('[ContextManager] Failed to clear corrupted storage:', removeError);
      }
    }
  }

  private saveToStorage(): void {
    if (!this.config.persistToStorage) return;

    try {
      const contexts = Array.from(this.contexts.values());
      localStorage.setItem(this.config.storageKey, JSON.stringify(contexts));
    } catch (e) {
      console.error('[ContextManager] Failed to save to storage:', e);
    }
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  getContext(id: string, name?: string): ConversationContext {
    let context = this.contexts.get(id);

    if (!context) {
      context = {
        id,
        name: name || id,
        messages: [],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        estimatedTokens: 0,
      };
      this.contexts.set(id, context);
      this.saveToStorage();
    }

    return context;
  }

  clearContext(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.messages = [];
      context.estimatedTokens = 0;
      context.lastUpdatedAt = Date.now();
      this.saveToStorage();
    }
  }

  deleteContext(contextId: string): void {
    this.contexts.delete(contextId);
    this.saveToStorage();
  }

  /**
   * Clear all contexts (used by Start Fresh)
   */
  clearAllContexts(): void {
    this.contexts.clear();
    this.saveToStorage();
    console.log('[ContextManager] All contexts cleared');
  }

  listContexts(): ConversationContext[] {
    return Array.from(this.contexts.values());
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  addMessage(
    contextId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>,
    actualTokens?: number // Optional: actual token count from API
  ): ContextMessage {
    const context = this.getContext(contextId);

    const message: ContextMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    context.messages.push(message);
    // Use actual tokens if provided, otherwise estimate
    const tokenCount = actualTokens ?? estimateTokens(content);
    context.estimatedTokens += tokenCount;
    context.lastUpdatedAt = Date.now();

    // Debug logging for message tracking
    console.log(
      `[ContextManager] addMessage to "${contextId}": role=${role}, contentLen=${content.length}, tokens=${tokenCount}, totalMessages=${context.messages.length}, totalTokens=${context.estimatedTokens}`
    );

    // Note: Compaction check is now based on remaining context space
    // The caller should use needsCompaction(contextId, modelContextSize) to check

    this.saveToStorage();
    return message;
  }

  addTokens(contextId: string, tokens: number): void {
    const context = this.getContext(contextId);
    context.estimatedTokens += tokens;
    context.lastUpdatedAt = Date.now();
    this.saveToStorage();
  }

  setTokenCount(contextId: string, tokens: number): void {
    const context = this.getContext(contextId);
    context.estimatedTokens = tokens;
    context.lastUpdatedAt = Date.now();
    this.saveToStorage();
  }

  updateLastMessage(contextId: string, content: string): void {
    const context = this.contexts.get(contextId);
    if (!context || context.messages.length === 0) return;

    const lastMsg = context.messages[context.messages.length - 1];
    if (lastMsg.role === 'assistant') {
      // Update token estimate (CTX-001 fix: ensure non-negative)
      const oldTokens = estimateTokens(lastMsg.content);
      const newTokens = estimateTokens(content);
      context.estimatedTokens = Math.max(0, context.estimatedTokens - oldTokens + newTokens);
      lastMsg.content = content;
      context.lastUpdatedAt = Date.now();

      // AI-006 fix: Debounce save during streaming to prevent data loss
      if (this.streamingSaveTimeout) {
        clearTimeout(this.streamingSaveTimeout);
      }
      this.streamingSaveTimeout = setTimeout(() => {
        this.saveToStorage();
        this.streamingSaveTimeout = null;
      }, STREAMING_SAVE_DEBOUNCE_MS);
    }
  }

  finalizeMessage(_contextId: string): void {
    // AI-006 fix: Clear any pending debounced save
    if (this.streamingSaveTimeout) {
      clearTimeout(this.streamingSaveTimeout);
      this.streamingSaveTimeout = null;
    }
    this.saveToStorage();
  }

  // ============================================================================
  // Message Retrieval
  // ============================================================================

  getMessagesForAI(
    contextId: string,
    maxMessages?: number
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    const context = this.contexts.get(contextId);
    if (!context) {
      console.log(`[ContextManager] getMessagesForAI: No context found for "${contextId}"`);
      return [];
    }

    let messages = context.messages.filter((m) => m.role !== 'system');

    if (maxMessages && messages.length > maxMessages) {
      messages = messages.slice(-maxMessages);
    }

    console.log(
      `[ContextManager] getMessagesForAI("${contextId}"): returning ${messages.length} messages, total tokens: ${context.estimatedTokens}`
    );

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  getConversationAsText(contextId: string, maxMessages?: number): string {
    const messages = this.getMessagesForAI(contextId, maxMessages);
    return messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
  }

  // ============================================================================
  // Token Management & Compaction
  // ============================================================================

  /**
   * Check if context needs compaction based on REMAINING context space.
   * Compaction is triggered when remaining context falls below minRemainingTokens.
   *
   * @param contextId - The context to check
   * @param modelContextSize - The total context window size of the current model
   * @returns true if compaction is needed
   */
  needsCompaction(contextId: string, modelContextSize?: number): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;

    // If no model context size provided, use a reasonable default (128K)
    const contextWindow = modelContextSize || 128000;
    const remainingTokens = contextWindow - context.estimatedTokens;

    // Trigger compaction when remaining space is less than minimum required
    const needsCompact = remainingTokens < this.config.minRemainingTokens;

    if (needsCompact) {
      console.log(
        `[ContextManager] Context "${contextId}" needs compaction: ` +
          `remaining=${remainingTokens}, minRequired=${this.config.minRemainingTokens}, ` +
          `current=${context.estimatedTokens}, modelLimit=${contextWindow}`
      );
    }

    return needsCompact;
  }

  /**
   * Get remaining context space for a given context
   */
  getRemainingTokens(contextId: string, modelContextSize: number): number {
    const context = this.contexts.get(contextId);
    if (!context) return modelContextSize;
    return Math.max(0, modelContextSize - context.estimatedTokens);
  }

  /**
   * Get minimum remaining tokens threshold
   */
  getMinRemainingTokens(): number {
    return this.config.minRemainingTokens;
  }

  async compactContext(contextId: string, summarizer: (text: string) => Promise<string>): Promise<void> {
    const context = this.contexts.get(contextId);
    if (!context || context.messages.length < 4) return;

    console.log(`[ContextManager] Compacting context "${contextId}" (${context.estimatedTokens} tokens)`);

    // Keep the last 2 messages, summarize the rest
    const toSummarize = context.messages.slice(0, -2);
    const toKeep = context.messages.slice(-2);

    if (toSummarize.length === 0) return;

    // Create summary text
    const summaryInput = toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n\n');

    try {
      const summary = await summarizer(summaryInput);

      // Replace old messages with summary
      context.messages = [
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: `[Previous conversation summary]\n${summary}`,
          timestamp: Date.now(),
        },
        ...toKeep,
      ];

      // Recalculate tokens
      context.estimatedTokens = context.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

      context.lastUpdatedAt = Date.now();
      this.saveToStorage();

      console.log(`[ContextManager] Compacted to ${context.estimatedTokens} tokens`);
    } catch (e) {
      console.error('[ContextManager] Failed to compact:', e);
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats(contextId: string): { messages: number; tokens: number; lastUpdated: Date } | null {
    const context = this.contexts.get(contextId);
    if (!context) return null;

    return {
      messages: context.messages.length,
      tokens: context.estimatedTokens,
      lastUpdated: new Date(context.lastUpdatedAt),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let contextManagerInstance: ConversationContextManager | null = null;

export function getContextManager(config?: Partial<ContextManagerConfig>): ConversationContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ConversationContextManager(config);
  }
  return contextManagerInstance;
}

export default ConversationContextManager;
