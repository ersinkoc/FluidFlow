/**
 * useContextSync - Syncs chat messages to ConversationContextManager
 *
 * Handles:
 * - Session ID management per project
 * - Message sync with deduplication
 * - Token tracking from message content
 */

import { useEffect, useRef } from 'react';
import { ChatMessage } from '@/types';
import { getContextManager, CONTEXT_IDS } from '@/services/conversationContext';

interface UseContextSyncOptions {
  projectId: string | undefined;
  messages: ChatMessage[];
}

export function useContextSync({ projectId, messages }: UseContextSyncOptions) {
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.MAIN_CHAT}-${projectId || 'default'}`);
  // Track which messages have been synced to prevent duplicates on batch updates
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());

  // Update session ID when project changes
  useEffect(() => {
    sessionIdRef.current = `${CONTEXT_IDS.MAIN_CHAT}-${projectId || 'default'}`;
    // Clear synced message IDs when project changes (different projects have different contexts)
    syncedMessageIdsRef.current.clear();
    console.log(`[ContextSync] Project changed, new session: ${sessionIdRef.current}`);
  }, [projectId]);

  // Sync messages with context manager
  // BUG FIX: Sync ALL new messages, not just the last one
  // React 18 batches state updates, so multiple messages can be added before this runs
  useEffect(() => {
    if (messages.length === 0) return;

    // Find all messages that haven't been synced yet
    const unsynced = messages.filter(msg => !syncedMessageIdsRef.current.has(msg.id));
    if (unsynced.length === 0) return;

    console.log(`[ContextSync] Found ${unsynced.length} unsync'd message(s) to add`);

    for (const msg of unsynced) {
      // For user messages: use llmContent (full codebase) or prompt
      // For assistant messages: use explanation/error + file content for accurate token counting
      let content: string;
      let actualTokens: number | undefined;

      if (msg.role === 'user') {
        content = msg.llmContent || msg.prompt || '';
        // Use actual token count if available (e.g., from codebase sync)
        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      } else {
        // For assistant messages, include file content in token estimation
        const textContent = msg.explanation || msg.error || '';
        const filesContent = msg.files
          ? Object.entries(msg.files).map(([path, code]) => `// ${path}\n${code}`).join('\n\n')
          : '';
        content = textContent + (filesContent ? '\n\n' + filesContent : '');

        // Use actual token count from API if available
        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      }

      console.log(`[ContextSync] Adding ${msg.role} message (id: ${msg.id.slice(0, 8)}...) to session "${sessionIdRef.current}", content length: ${content.length}, tokens: ${actualTokens || 'estimated'}`);

      contextManager.addMessage(
        sessionIdRef.current,
        msg.role,
        content,
        { messageId: msg.id },
        actualTokens
      );

      // Mark as synced
      syncedMessageIdsRef.current.add(msg.id);
    }
    // Note: contextManager is a singleton, messages array is iterated but we only trigger on length change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  return {
    sessionId: sessionIdRef.current,
    contextManager,
  };
}
