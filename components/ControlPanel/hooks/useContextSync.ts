/**
 * useContextSync - Syncs chat messages to ConversationContextManager
 *
 * Handles:
 * - Session ID management per project
 * - Message sync with deduplication
 * - Token tracking from message content
 * - Smart context reset when project has existing AI context
 */

import { useEffect, useRef } from 'react';
import { ChatMessage } from '@/types';
import { getContextManager, CONTEXT_IDS } from '@/services/conversationContext';
import { getProjectContext } from '@/services/projectContext';
import { getProviderManager } from '@/services/ai';

/**
 * Get current model's context window size
 */
function getModelContextSize(): number {
  try {
    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return 128000;
    const model = config.models.find(m => m.id === config.defaultModel);
    return model?.contextWindow || 128000;
  } catch {
    return 128000;
  }
}

interface UseContextSyncOptions {
  projectId: string | undefined;
  messages: ChatMessage[];
  /** When true, skip syncing restored messages (they won't count toward token usage) */
  skipRestoredMessages?: boolean;
}

export function useContextSync({ projectId, messages }: UseContextSyncOptions) {
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.MAIN_CHAT}-${projectId || 'default'}`);
  // Track which messages have been synced to prevent duplicates
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());
  // Track initialization per project
  const hasInitializedRef = useRef<string | null>(null);

  // Initialize session and handle project context
  useEffect(() => {
    const newSessionId = `${CONTEXT_IDS.MAIN_CHAT}-${projectId || 'default'}`;
    sessionIdRef.current = newSessionId;

    // On project change, check if we should skip syncing historical messages
    if (projectId && projectId !== hasInitializedRef.current) {
      const existingContext = getProjectContext(projectId);

      if (existingContext) {
        // Project has AI context - mark all current messages as synced
        // so they don't get re-added to token count
        console.log(`[ContextSync] Project has AI context, skipping ${messages.length} historical messages`);
        messages.forEach(msg => syncedMessageIdsRef.current.add(msg.id));

        // Clear any existing context tokens (fresh start)
        const stats = contextManager.getStats(newSessionId);
        if (stats && stats.tokens > 0) {
          console.log(`[ContextSync] Clearing ${stats.tokens.toLocaleString()} stale tokens`);
          contextManager.clearContext(newSessionId);
        }
      } else {
        // No AI context - allow normal message syncing
        syncedMessageIdsRef.current.clear();
      }

      hasInitializedRef.current = projectId;
    } else if (!projectId && hasInitializedRef.current) {
      // Switched to scratch - reset
      syncedMessageIdsRef.current.clear();
      hasInitializedRef.current = null;
    }

    console.log(`[ContextSync] Session: ${newSessionId}`);
  }, [projectId, contextManager, messages]);

  // Sync NEW messages only - messages already in syncedMessageIdsRef are skipped
  useEffect(() => {
    if (messages.length === 0) return;

    // Find messages that haven't been synced yet
    const unsynced = messages.filter(msg => !syncedMessageIdsRef.current.has(msg.id));
    if (unsynced.length === 0) return;

    console.log(`[ContextSync] Syncing ${unsynced.length} new message(s)`);

    for (const msg of unsynced) {
      let content: string;
      let actualTokens: number | undefined;

      if (msg.role === 'user') {
        content = msg.llmContent || msg.prompt || '';
        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      } else {
        const textContent = msg.explanation || msg.error || '';
        const filesContent = msg.files
          ? Object.entries(msg.files).map(([path, code]) => `// ${path}\n${code}`).join('\n\n')
          : '';
        content = textContent + (filesContent ? '\n\n' + filesContent : '');

        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      }

      contextManager.addMessage(
        sessionIdRef.current,
        msg.role,
        content,
        { messageId: msg.id },
        actualTokens
      );

      syncedMessageIdsRef.current.add(msg.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  return {
    sessionId: sessionIdRef.current,
    contextManager,
  };
}
