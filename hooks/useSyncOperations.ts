/**
 * useSyncOperations Hook
 *
 * Handles file sync operations with the backend, including sync confirmation.
 * Extracted from useProject for better separation of concerns.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { projectApi, autoSave } from '@/services/projectApi';
import type { FileSystem } from '@/types';

// Pending sync confirmation when significant file reduction detected
export interface PendingSyncConfirmation {
  files: FileSystem;
  existingFileCount: number;
  newFileCount: number;
  message: string;
}

export interface SyncOperationsState {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  pendingSyncConfirmation: PendingSyncConfirmation | null;
  syncError: string | null;
}

export interface UseSyncOperationsReturn extends SyncOperationsState {
  /** Update files locally (no backend sync) */
  updateFiles: (files: FileSystem) => void;
  /** Force sync files to backend */
  syncFiles: () => Promise<boolean>;
  /** Confirm pending sync after user confirmation */
  confirmPendingSync: () => Promise<boolean>;
  /** Cancel pending sync */
  cancelPendingSync: () => void;
  /** Clear sync error */
  clearSyncError: () => void;
  /** Reset auto-save state */
  resetAutoSave: () => void;
}

interface UseSyncOperationsConfig {
  currentProjectId: string | null | undefined;
  files: FileSystem;
  isInitialized: boolean;
  onFilesUpdate: (files: FileSystem) => void;
}

/**
 * Hook to manage file sync operations
 *
 * @param config - Configuration object
 *
 * @example
 * ```tsx
 * const { isSyncing, syncFiles, updateFiles } = useSyncOperations({
 *   currentProjectId: project?.id,
 *   files: currentFiles,
 *   isInitialized: true,
 *   onFilesUpdate: setFiles,
 * });
 *
 * // Update files locally
 * updateFiles(newFiles);
 *
 * // Sync to backend
 * await syncFiles();
 * ```
 */
export function useSyncOperations(config: UseSyncOperationsConfig): UseSyncOperationsReturn {
  const { currentProjectId, files, isInitialized, onFilesUpdate } = config;

  const [state, setState] = useState<SyncOperationsState>({
    isSyncing: false,
    lastSyncedAt: null,
    pendingSyncConfirmation: null,
    syncError: null,
  });

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFilesRef = useRef<string>('');

  // Update files (LOCAL ONLY - no auto-sync to backend)
  // Files sync to backend only on COMMIT (git-centric approach)
  const updateFiles = useCallback(
    (newFiles: FileSystem) => {
      onFilesUpdate(newFiles);
    },
    [onFilesUpdate]
  );

  // Force sync files immediately
  const syncFiles = useCallback(async (): Promise<boolean> => {
    if (!currentProjectId) {
      console.warn('[Sync] Ignoring syncFiles - no current project');
      return false;
    }

    // CRITICAL: Don't sync until initialized
    if (!isInitialized) {
      console.warn('[Sync] Ignoring syncFiles - not initialized yet');
      setState((prev) => ({
        ...prev,
        syncError: 'Cannot sync: project still initializing',
      }));
      return false;
    }

    // CRITICAL: Never sync empty files - protect against data loss
    const fileCount = Object.keys(files).length;
    if (fileCount === 0) {
      console.warn('[Sync] Blocking empty files sync - would cause data loss!');
      setState((prev) => ({
        ...prev,
        syncError: 'Cannot sync: no files to save (data loss protection)',
      }));
      return false;
    }

    // Clear pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    setState((prev) => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const response = await projectApi.update(currentProjectId, { files });

      // Check if confirmation is required
      if (response.confirmationRequired) {
        console.log('[Sync] Sync requires confirmation:', response.message);
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          pendingSyncConfirmation: {
            files: files,
            existingFileCount: response.existingFileCount || 0,
            newFileCount: response.newFileCount || 0,
            message:
              response.message ||
              'Significant file reduction detected. Do you want to continue?',
          },
        }));
        return false; // Not synced yet, waiting for confirmation
      }

      // Check if blocked
      if (response.blocked) {
        console.warn('[Sync] Sync blocked:', response.warning);
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          syncError: response.warning || 'Sync blocked by server',
        }));
        return false;
      }

      lastFilesRef.current = JSON.stringify(files);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));
      return true;
    } catch (err) {
      console.error('[Sync] syncFiles failed:', err);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncError: 'Failed to sync files',
      }));
      return false;
    }
  }, [currentProjectId, files, isInitialized]);

  // Confirm pending sync (force update after user confirmation)
  const confirmPendingSync = useCallback(async (): Promise<boolean> => {
    if (!currentProjectId || !state.pendingSyncConfirmation) {
      return false;
    }

    const { files: pendingFiles } = state.pendingSyncConfirmation;

    setState((prev) => ({ ...prev, isSyncing: true, pendingSyncConfirmation: null }));

    try {
      // Send with force=true to bypass the confirmation check
      const response = await projectApi.update(currentProjectId, {
        files: pendingFiles,
        force: true,
      });

      if (response.blocked) {
        console.warn('[Sync] Force sync still blocked:', response.warning);
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          syncError: response.warning || 'Force sync blocked',
        }));
        return false;
      }

      lastFilesRef.current = JSON.stringify(pendingFiles);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));
      console.log('[Sync] Force sync completed after confirmation');
      return true;
    } catch (err) {
      console.error('[Sync] confirmPendingSync failed:', err);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncError: 'Failed to sync files',
      }));
      return false;
    }
  }, [currentProjectId, state.pendingSyncConfirmation]);

  // Cancel pending sync
  const cancelPendingSync = useCallback(() => {
    setState((prev) => ({ ...prev, pendingSyncConfirmation: null }));
    console.log('[Sync] Pending sync cancelled by user');
  }, []);

  // Clear sync error
  const clearSyncError = useCallback(() => {
    setState((prev) => ({ ...prev, syncError: null }));
  }, []);

  // Reset auto-save state
  const resetAutoSave = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    autoSave.reset();
    lastFilesRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      autoSave.reset();
    };
  }, []);

  return {
    ...state,
    updateFiles,
    syncFiles,
    confirmPendingSync,
    cancelPendingSync,
    clearSyncError,
    resetAutoSave,
  };
}

export default useSyncOperations;
