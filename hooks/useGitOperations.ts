/**
 * useGitOperations Hook
 *
 * Handles git-related operations: init, commit, status refresh.
 * Extracted from useProject for better separation of concerns.
 */

import { useState, useCallback } from 'react';
import { gitApi, projectApi, GitStatus } from '@/services/projectApi';
import type { FileSystem } from '@/types';

export interface GitOperationsState {
  gitStatus: GitStatus | null;
  isGitOperating: boolean;
  gitError: string | null;
}

export interface UseGitOperationsReturn extends GitOperationsState {
  /** Initialize git repository */
  initGit: (force?: boolean) => Promise<boolean>;
  /** Create a commit with current files */
  commit: (message: string) => Promise<boolean>;
  /** Refresh git status from backend */
  refreshGitStatus: () => Promise<void>;
  /** Update git status directly (for external updates) */
  setGitStatus: (status: GitStatus | null) => void;
  /** Clear git error */
  clearGitError: () => void;
}

interface UseGitOperationsConfig {
  currentProjectId: string | null | undefined;
  files: FileSystem;
}

/**
 * Hook to manage git operations
 *
 * @param config - Configuration object with currentProjectId and files
 *
 * @example
 * ```tsx
 * const { gitStatus, initGit, commit } = useGitOperations({
 *   currentProjectId: project?.id,
 *   files: currentFiles,
 * });
 *
 * // Initialize git
 * await initGit();
 *
 * // Create commit
 * await commit('Initial commit');
 * ```
 */
export function useGitOperations(config: UseGitOperationsConfig): UseGitOperationsReturn {
  const { currentProjectId, files } = config;

  const [state, setState] = useState<GitOperationsState>({
    gitStatus: null,
    isGitOperating: false,
    gitError: null,
  });

  // Initialize git
  // force=true will delete and reinitialize corrupted repos
  const initGit = useCallback(
    async (force = false): Promise<boolean> => {
      console.log('[GitOps] initGit called with force:', force);

      if (!currentProjectId) {
        console.warn('[GitOps] initGit failed - no current project');
        return false;
      }

      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        console.warn('[GitOps] Cannot init git with empty files');
        setState((prev) => ({ ...prev, gitError: 'Cannot initialize: no files' }));
        return false;
      }

      setState((prev) => ({ ...prev, gitError: null, isGitOperating: true }));

      try {
        // Step 1: Sync files to backend first (force=true to bypass confirmation)
        console.log('[GitOps] initGit - syncing', fileCount, 'files first...');
        const syncResponse = await projectApi.update(currentProjectId, { files, force: true });
        if (syncResponse.blocked) {
          console.error('[GitOps] Sync blocked before git init:', syncResponse.warning);
          setState((prev) => ({
            ...prev,
            isGitOperating: false,
            gitError: 'Sync blocked: ' + syncResponse.warning,
          }));
          return false;
        }
        console.log('[GitOps] initGit - files synced');

        // Step 2: Initialize git (force=true for corrupted repos)
        console.log('[GitOps] initGit - calling gitApi.init...');
        await gitApi.init(currentProjectId, force);
        console.log('[GitOps] initGit - git initialized successfully');

        // Step 3: Refresh status - gitStatus.initialized will now be true
        console.log('[GitOps] initGit - refreshing git status...');
        const gitStatus = await gitApi.status(currentProjectId);
        console.log('[GitOps] initGit - got status:', gitStatus);

        setState((prev) => ({
          ...prev,
          gitStatus,
          isGitOperating: false,
        }));

        return true;
      } catch (err) {
        console.error('[GitOps] initGit failed:', err);
        setState((prev) => ({
          ...prev,
          isGitOperating: false,
          gitError: 'Failed to initialize git',
        }));
        return false;
      }
    },
    [currentProjectId, files]
  );

  // Create commit - syncs files to backend first, then commits
  // This is the ONLY time files are synced to backend (git-centric approach)
  const commit = useCallback(
    async (message: string): Promise<boolean> => {
      if (!currentProjectId || !state.gitStatus?.initialized) return false;

      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        console.warn('[GitOps] Cannot commit empty files');
        setState((prev) => ({ ...prev, gitError: 'Cannot commit: no files' }));
        return false;
      }

      setState((prev) => ({ ...prev, gitError: null, isGitOperating: true }));

      try {
        console.log('[GitOps] Committing', fileCount, 'files...');

        // Step 1: Sync files to backend (force=true to bypass confirmation)
        const syncResponse = await projectApi.update(currentProjectId, { files, force: true });
        if (syncResponse.blocked) {
          console.error('[GitOps] Sync blocked before commit:', syncResponse.warning);
          setState((prev) => ({
            ...prev,
            isGitOperating: false,
            gitError: 'Sync blocked: ' + syncResponse.warning,
          }));
          return false;
        }
        console.log('[GitOps] Files synced to backend');

        // Step 2: Git commit
        await gitApi.commit(currentProjectId, message, files);
        console.log('[GitOps] Git commit created');

        // Step 3: Refresh status
        const gitStatus = await gitApi.status(currentProjectId);
        setState((prev) => ({
          ...prev,
          gitStatus,
          isGitOperating: false,
        }));

        console.log('[GitOps] Commit complete!');
        return true;
      } catch (err) {
        console.error('[GitOps] Commit failed:', err);
        setState((prev) => ({
          ...prev,
          isGitOperating: false,
          gitError: 'Failed to create commit',
        }));
        return false;
      }
    },
    [currentProjectId, state.gitStatus?.initialized, files]
  );

  // Refresh git status - this is the single source of truth for git state
  const refreshGitStatus = useCallback(async () => {
    if (!currentProjectId) return;

    try {
      const gitStatus = await gitApi.status(currentProjectId);
      console.log('[GitOps] Git status response:', gitStatus);

      setState((prev) => ({
        ...prev,
        gitStatus,
      }));
    } catch (err) {
      console.error('[GitOps] Failed to refresh git status:', err);
      // On error, keep current gitStatus - don't reset to null
    }
  }, [currentProjectId]);

  // Set git status directly (for external updates)
  const setGitStatus = useCallback((status: GitStatus | null) => {
    setState((prev) => ({ ...prev, gitStatus: status }));
  }, []);

  // Clear git error
  const clearGitError = useCallback(() => {
    setState((prev) => ({ ...prev, gitError: null }));
  }, []);

  return {
    ...state,
    initGit,
    commit,
    refreshGitStatus,
    setGitStatus,
    clearGitError,
  };
}

export default useGitOperations;
