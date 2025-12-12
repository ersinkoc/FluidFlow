// Conversation Context Manager
// Manages separate contexts for different features (prompt improver, git, db studio, etc.)

export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  id: string;
  name: string;
  messages: ContextMessage[];
  createdAt: number;
  lastUpdatedAt: number;
  metadata?: Record<string, any>;
  // Token estimate for context management
  estimatedTokens: number;
}

export interface ContextManagerConfig {
  maxTokensPerContext: number;  // When to trigger compaction
  compactToTokens: number;      // Target tokens after compaction
  persistToStorage: boolean;    // Whether to save to localStorage
  storageKey: string;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokensPerContext: 8000,    // ~8k tokens before compaction
  compactToTokens: 2000,        // Compact to ~2k tokens
  persistToStorage: true,
  storageKey: 'fluidflow_contexts'
};

// AI-008 fix: Improved token estimation using word-based heuristics
// Average: ~0.75 tokens per word for English, ~1.3 tokens per word for code
function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  // Count words (sequences of alphanumeric characters)
  const wordMatches = text.match(/\b\w+\b/g);
  const wordCount = wordMatches ? wordMatches.length : 0;

  // Count code-like tokens (operators, brackets, special chars)
  const codeMatches = text.match(/[{}()[\]<>:;,=+\-*/&|!@#$%^]+/g);
  const codeCharCount = codeMatches ? codeMatches.reduce((sum: number, t: string) => sum + t.length, 0) : 0;

  // Count numbers (each number is typically 1 token)
  const numberMatches = text.match(/\b\d+\.?\d*\b/g);
  const numberCount = numberMatches ? numberMatches.length : 0;

  // Estimate based on content type
  // - Words: ~1.3 tokens per word (accounts for subword tokenization)
  // - Code tokens: ~0.5 tokens per character (densely packed)
  // - Numbers: ~1 token each

  const wordTokens = Math.ceil(wordCount * 1.3);
  const codeTokens = Math.ceil(codeCharCount * 0.5);

  // Add a small base for formatting/whitespace
  const totalEstimate = wordTokens + codeTokens + numberCount;

  // Ensure minimum of 1 token for non-empty strings, with fallback to char-based for very short strings
  return Math.max(1, totalEstimate || Math.ceil(text.length / 4));
}

class ConversationContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private config: ContextManagerConfig;
  // AI-006 fix: Debounce streaming saves to prevent data loss
  private streamingSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private static STREAMING_SAVE_DEBOUNCE_MS = 2000; // Save every 2s during streaming

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  // Load contexts from localStorage
  private loadFromStorage(): void {
    if (!this.config.persistToStorage) return;

    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ConversationContext[];
        parsed.forEach(ctx => this.contexts.set(ctx.id, ctx));
        console.log(`[ContextManager] Loaded ${parsed.length} contexts from storage`);
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

  // Save contexts to localStorage
  private saveToStorage(): void {
    if (!this.config.persistToStorage) return;

    try {
      const contexts = Array.from(this.contexts.values());
      localStorage.setItem(this.config.storageKey, JSON.stringify(contexts));
    } catch (e) {
      console.error('[ContextManager] Failed to save to storage:', e);
    }
  }

  // Get or create a context
  getContext(id: string, name?: string): ConversationContext {
    let context = this.contexts.get(id);

    if (!context) {
      context = {
        id,
        name: name || id,
        messages: [],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        estimatedTokens: 0
      };
      this.contexts.set(id, context);
      this.saveToStorage();
    }

    return context;
  }

  // Add a message to a context
  addMessage(
    contextId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): ContextMessage {
    const context = this.getContext(contextId);

    const message: ContextMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };

    context.messages.push(message);
    context.estimatedTokens += estimateTokens(content);
    context.lastUpdatedAt = Date.now();

    // Check if compaction needed
    if (context.estimatedTokens > this.config.maxTokensPerContext) {
      console.log(`[ContextManager] Context "${contextId}" exceeds token limit, needs compaction`);
      // Don't auto-compact - let the caller decide
    }

    this.saveToStorage();
    return message;
  }

  // Update the last assistant message (for streaming)
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
      // Save periodically rather than never during streaming
      if (this.streamingSaveTimeout) {
        clearTimeout(this.streamingSaveTimeout);
      }
      this.streamingSaveTimeout = setTimeout(() => {
        this.saveToStorage();
        this.streamingSaveTimeout = null;
      }, ConversationContextManager.STREAMING_SAVE_DEBOUNCE_MS);
    }
  }

  // Finalize streaming (save after streaming completes)
  finalizeMessage(_contextId: string): void {
    // AI-006 fix: Clear any pending debounced save
    if (this.streamingSaveTimeout) {
      clearTimeout(this.streamingSaveTimeout);
      this.streamingSaveTimeout = null;
    }
    this.saveToStorage();
  }

  // Get messages formatted for AI (as conversation history)
  getMessagesForAI(contextId: string, maxMessages?: number): Array<{ role: string; content: string }> {
    const context = this.contexts.get(contextId);
    if (!context) return [];

    let messages = context.messages.filter(m => m.role !== 'system');

    if (maxMessages && messages.length > maxMessages) {
      messages = messages.slice(-maxMessages);
    }

    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  // Get conversation as text (for providers that don't support message arrays)
  getConversationAsText(contextId: string, maxMessages?: number): string {
    const messages = this.getMessagesForAI(contextId, maxMessages);
    return messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }

  // Check if context needs compaction
  needsCompaction(contextId: string): boolean {
    const context = this.contexts.get(contextId);
    return context ? context.estimatedTokens > this.config.maxTokensPerContext : false;
  }

  // Compact a context using AI summarization
  async compactContext(
    contextId: string,
    summarizer: (text: string) => Promise<string>
  ): Promise<void> {
    const context = this.contexts.get(contextId);
    if (!context || context.messages.length < 4) return;

    console.log(`[ContextManager] Compacting context "${contextId}" (${context.estimatedTokens} tokens)`);

    // Keep the last 2 messages, summarize the rest
    const toSummarize = context.messages.slice(0, -2);
    const toKeep = context.messages.slice(-2);

    if (toSummarize.length === 0) return;

    // Create summary text
    const summaryInput = toSummarize
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    try {
      const summary = await summarizer(summaryInput);

      // Replace old messages with summary
      context.messages = [
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: `[Previous conversation summary]\n${summary}`,
          timestamp: Date.now()
        },
        ...toKeep
      ];

      // Recalculate tokens
      context.estimatedTokens = context.messages.reduce(
        (sum, m) => sum + estimateTokens(m.content),
        0
      );

      context.lastUpdatedAt = Date.now();
      this.saveToStorage();

      console.log(`[ContextManager] Compacted to ${context.estimatedTokens} tokens`);
    } catch (e) {
      console.error('[ContextManager] Failed to compact:', e);
    }
  }

  // Clear a specific context
  clearContext(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.messages = [];
      context.estimatedTokens = 0;
      context.lastUpdatedAt = Date.now();
      this.saveToStorage();
    }
  }

  // Delete a context entirely
  deleteContext(contextId: string): void {
    this.contexts.delete(contextId);
    this.saveToStorage();
  }

  // List all contexts
  listContexts(): ConversationContext[] {
    return Array.from(this.contexts.values());
  }

  // Get context stats
  getStats(contextId: string): { messages: number; tokens: number; lastUpdated: Date } | null {
    const context = this.contexts.get(contextId);
    if (!context) return null;

    return {
      messages: context.messages.length,
      tokens: context.estimatedTokens,
      lastUpdated: new Date(context.lastUpdatedAt)
    };
  }
}

// Singleton instance
let contextManagerInstance: ConversationContextManager | null = null;

export function getContextManager(config?: Partial<ContextManagerConfig>): ConversationContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ConversationContextManager(config);
  }
  return contextManagerInstance;
}

// Predefined context IDs for different features
export const CONTEXT_IDS = {
  MAIN_CHAT: 'main-chat',
  PROMPT_IMPROVER: 'prompt-improver',
  GIT_COMMIT: 'git-commit',
  DB_STUDIO: 'db-studio',
  CODE_REVIEW: 'code-review',
  QUICK_EDIT: 'quick-edit'
} as const;

export default ConversationContextManager;
