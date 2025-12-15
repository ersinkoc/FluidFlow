/**
 * useContextPersistence Hook
 *
 * Handles saving and loading project context (conversation history, version history)
 * to/from the backend. Extracted from useProject for better separation of concerns.
 */

import { useCallback } from 'react';
import { projectApi, ProjectContext } from '@/services/projectApi';

export interface UseContextPersistenceReturn {
  /** Save context (including version history) to backend */
  saveContext: (context: Partial<ProjectContext>) => Promise<boolean>;
  /** Get context from backend for current project */
  getContext: () => Promise<ProjectContext | null>;
}

/**
 * Hook to manage project context persistence
 *
 * @param currentProjectId - Current project ID (null if no project is open)
 *
 * @example
 * ```tsx
 * const { saveContext, getContext } = useContextPersistence(project?.id);
 *
 * // Save conversation history
 * await saveContext({ history: conversationHistory });
 *
 * // Load context when opening project
 * const context = await getContext();
 * ```
 */
export function useContextPersistence(
  currentProjectId: string | null | undefined
): UseContextPersistenceReturn {
  // Save context (including version history) to backend
  const saveContext = useCallback(
    async (context: Partial<ProjectContext>): Promise<boolean> => {
      if (!currentProjectId) {
        console.warn('[ContextPersistence] Cannot save context - no current project');
        return false;
      }

      try {
        await projectApi.saveContext(currentProjectId, context);
        console.log('[ContextPersistence] Saved context for project:', currentProjectId);
        return true;
      } catch (err) {
        console.error('[ContextPersistence] Failed to save context:', err);
        return false;
      }
    },
    [currentProjectId]
  );

  // Get context from backend for current project
  const getContext = useCallback(async (): Promise<ProjectContext | null> => {
    if (!currentProjectId) {
      return null;
    }

    try {
      return await projectApi.getContext(currentProjectId);
    } catch {
      return null;
    }
  }, [currentProjectId]);

  return {
    saveContext,
    getContext,
  };
}

export default useContextPersistence;
