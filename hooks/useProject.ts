import { useState, useCallback, useEffect, useRef } from 'react';
import { projectApi, gitApi, autoSave, checkServerHealth, ProjectMeta, GitStatus, ProjectContext } from '@/services/projectApi';
import type { FileSystem } from '@/types';

// Re-export types for use in other components
export type { ProjectContext, HistoryEntry } from '@/services/projectApi';

// Pending sync confirmation when significant file reduction detected
export interface PendingSyncConfirmation {
  files: FileSystem;
  existingFileCount: number;
  newFileCount: number;
  message: string;
}

export interface ProjectState {
  // Current project
  currentProject: ProjectMeta | null;
  files: FileSystem;

  // Project list
  projects: ProjectMeta[];
  isLoadingProjects: boolean;

  // Git state - gitStatus.initialized is the single source of truth
  gitStatus: GitStatus | null;

  // Server state
  isServerOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isInitialized: boolean; // True after initial load from backend

  // Sync confirmation
  pendingSyncConfirmation: PendingSyncConfirmation | null;

  // Errors
  error: string | null;
}

export interface UseProjectReturn extends ProjectState {
  // Project operations
  createProject: (name?: string, description?: string, initialFiles?: FileSystem) => Promise<ProjectMeta | null>;
  openProject: (id: string) => Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }>;
  closeProject: () => void;
  deleteProject: (id: string) => Promise<boolean>;
  duplicateProject: (id: string, newName?: string) => Promise<ProjectMeta | null>;
  refreshProjects: () => Promise<void>;

  // File operations
  updateFiles: (files: FileSystem) => void;
  syncFiles: () => Promise<boolean>;

  // Git operations
  initGit: (force?: boolean, filesToSync?: FileSystem) => Promise<boolean>;
  commit: (message: string, filesToCommit?: FileSystem) => Promise<boolean>;
  refreshGitStatus: () => Promise<void>;

  // Context management (now async - saves to backend)
  saveContext: (context: Partial<ProjectContext>) => Promise<boolean>;
  getContext: () => Promise<ProjectContext | null>;

  // Sync confirmation
  confirmPendingSync: () => Promise<boolean>;
  cancelPendingSync: () => void;

  // Utils
  clearError: () => void;
}

const _SYNC_DEBOUNCE_MS = 2000;
const STORAGE_KEY_PROJECT_ID = 'fluidflow_current_project_id';

// Helper to get/set localStorage (only for project ID persistence)
const storage = {
  getProjectId: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY_PROJECT_ID);
    } catch {
      return null;
    }
  },
  setProjectId: (id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY_PROJECT_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEY_PROJECT_ID);
      }
    } catch {
      // Ignore storage errors
    }
  },
};

export function useProject(onFilesChange?: (files: FileSystem) => void): UseProjectReturn {
  const [state, setState] = useState<ProjectState>({
    currentProject: null,
    files: {},
    projects: [],
    isLoadingProjects: false,
    gitStatus: null,
    isServerOnline: false,
    isSyncing: false,
    lastSyncedAt: null,
    isInitialized: false,
    pendingSyncConfirmation: null,
    error: null,
  });

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFilesRef = useRef<string>('');
  const hasRestoredRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false); // Prevents sync before load
  const restoreAbortedRef = useRef<boolean>(false); // Track if restore was cancelled
  const openProjectIdRef = useRef<string | null>(null); // Track current openProject operation

  // Check server health on mount
  useEffect(() => {
    const checkHealth = async () => {
      const isOnline = await checkServerHealth();
      setState(prev => ({ ...prev, isServerOnline: isOnline }));
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, []);

  // Load projects on mount
  useEffect(() => {
    if (state.isServerOnline) {
      refreshProjects();
    }
  }, [state.isServerOnline]);

  // Restore last opened project from localStorage when server comes online
  useEffect(() => {
    const restoreProject = async () => {
      if (!state.isServerOnline || hasRestoredRef.current) return;

      hasRestoredRef.current = true;
      restoreAbortedRef.current = false; // Reset abort flag
      const savedProjectId = storage.getProjectId();

      if (savedProjectId) {
        console.log('[Project] Restoring project from localStorage:', savedProjectId);
        try {
          const project = await projectApi.get(savedProjectId);

          // Check if restore was aborted (user opened different project)
          if (restoreAbortedRef.current) {
            console.log('[Project] Restore aborted - another project was opened');
            return;
          }

          setState(prev => ({
            ...prev,
            currentProject: project,
            files: project.files || {},
            lastSyncedAt: Date.now(),
          }));

          lastFilesRef.current = JSON.stringify(project.files || {});
          onFilesChange?.(project.files || {});

          // Refresh git status - this is the single source of truth
          try {
            // Check abort again before git status
            if (restoreAbortedRef.current) return;

            const gitStatus = await gitApi.status(savedProjectId);

            // Final abort check before updating state
            if (restoreAbortedRef.current) return;

            setState(prev => ({
              ...prev,
              gitStatus,
            }));
          } catch {
            // Git might not be initialized - gitStatus stays null
          }

          // Only mark as initialized if not aborted
          if (!restoreAbortedRef.current) {
            console.log('[Project] Restored successfully:', project.name);
            isInitializedRef.current = true; // Now safe to sync
            setState(prev => ({ ...prev, isInitialized: true }));
          }
        } catch (_err) {
          console.error('[Project] Failed to restore project:', _err);
          // Clear invalid project ID
          storage.setProjectId(null);
          isInitializedRef.current = true; // No project to restore, safe to create new
          setState(prev => ({ ...prev, isInitialized: true }));
        }
      } else {
        // No saved project, safe to create new ones
        isInitializedRef.current = true;
        setState(prev => ({ ...prev, isInitialized: true }));
      }
    };

    restoreProject();
  }, [state.isServerOnline, onFilesChange]);

  // Refresh projects list
  const refreshProjects = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingProjects: true, error: null }));

    try {
      const projects = await projectApi.list();
      setState(prev => ({ ...prev, projects, isLoadingProjects: false }));
    } catch (_err) {
      setState(prev => ({
        ...prev,
        isLoadingProjects: false,
        error: 'Failed to load projects',
      }));
    }
  }, []);

  // Create new project
  const createProject = useCallback(async (
    name?: string,
    description?: string,
    initialFiles?: FileSystem
  ): Promise<ProjectMeta | null> => {
    // Abort any in-flight restore operation
    restoreAbortedRef.current = true;

    setState(prev => ({ ...prev, error: null }));

    try {
      const project = await projectApi.create({
        name: name || 'Untitled Project',
        description,
        files: initialFiles,
      });

      setState(prev => ({
        ...prev,
        currentProject: project,
        files: project.files || {},
        // Filter out any existing project with the same ID to prevent duplicates
        projects: [project, ...prev.projects.filter(p => p.id !== project.id)],
        gitStatus: null, // Will be fetched on demand
        lastSyncedAt: Date.now(),
        isInitialized: true,
      }));

      // Save project ID to localStorage for persistence
      storage.setProjectId(project.id);

      lastFilesRef.current = JSON.stringify(project.files || {});
      isInitializedRef.current = true; // Safe to sync now
      onFilesChange?.(project.files || {});

      return project;
    } catch (_err) {
      setState(prev => ({ ...prev, error: 'Failed to create project' }));
      return null;
    }
  }, [onFilesChange]);

  // Open existing project - returns files directly to avoid stale closure issues
  const openProject = useCallback(async (id: string): Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }> => {
    // IMPORTANT: Abort any in-flight restore operation
    restoreAbortedRef.current = true;

    // Track this operation - used to detect if a newer openProject was called
    openProjectIdRef.current = id;

    // IMPORTANT: Clear any pending syncs from old project FIRST
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    autoSave.reset();

    // Temporarily disable syncing until new project is loaded
    isInitializedRef.current = false;

    setState(prev => ({ ...prev, error: null, isSyncing: true }));

    try {
      // Fetch project and context in parallel
      const [project, savedContext] = await Promise.all([
        projectApi.get(id),
        projectApi.getContext(id).catch(() => null) // Don't fail if context doesn't exist
      ]);

      // Check if a newer openProject call was made while we were fetching
      if (openProjectIdRef.current !== id) {
        console.log('[Project] openProject aborted - newer request in progress');
        return { success: false, files: {}, context: null };
      }

      const projectFiles = project.files || {};

      setState(prev => ({
        ...prev,
        currentProject: project,
        files: projectFiles,
        isSyncing: false,
        lastSyncedAt: Date.now(),
        isInitialized: true,
        // Reset git status - will be fetched fresh
        gitStatus: null,
      }));

      // Save project ID to localStorage for persistence
      storage.setProjectId(id);

      // Set lastFilesRef BEFORE enabling sync to prevent old files from syncing
      lastFilesRef.current = JSON.stringify(projectFiles);

      // NOW enable syncing for new project
      isInitializedRef.current = true;

      // Refresh git status async - single source of truth
      gitApi.status(id).then(gitStatus => {
        // Only update if this project is still the current one
        if (openProjectIdRef.current === id) {
          setState(prev => ({
            ...prev,
            gitStatus,
          }));
        }
      }).catch(() => {
        // Git might not be initialized - gitStatus stays null
      });

      console.log('[Project] Opened project:', project.name, 'with', Object.keys(projectFiles).length, 'files');
      if (savedContext?.history?.length) {
        console.log('[Project] Loaded context with', savedContext.history.length, 'history entries');
      }

      return { success: true, files: projectFiles, context: savedContext };
    } catch (_err) {
      // Only handle error if this is still the current operation
      if (openProjectIdRef.current === id) {
        console.error('[Project] Failed to open project:', _err);
        // Re-enable syncing if open fails
        isInitializedRef.current = true;
        setState(prev => ({
          ...prev,
          isSyncing: false,
          error: 'Failed to open project',
        }));
      }
      return { success: false, files: {}, context: null };
    }
  }, []);

  // Close current project
  const closeProject = useCallback(() => {
    // Clear any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    autoSave.reset();

    // Clear localStorage
    storage.setProjectId(null);

    setState(prev => ({
      ...prev,
      currentProject: null,
      files: {},
      gitStatus: null,
      lastSyncedAt: null,
    }));

    lastFilesRef.current = '';
  }, []);

  // Delete project
  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    setState(prev => ({ ...prev, error: null }));

    try {
      await projectApi.delete(id);

      // Clear localStorage if deleting current project
      const savedId = storage.getProjectId();
      if (savedId === id) {
        storage.setProjectId(null);
      }

      setState(prev => ({
        ...prev,
        projects: prev.projects.filter(p => p.id !== id),
        // Close if current project was deleted
        ...(prev.currentProject?.id === id ? {
          currentProject: null,
          files: {},
          gitStatus: null,
        } : {}),
      }));

      return true;
    } catch (_err) {
      setState(prev => ({ ...prev, error: 'Failed to delete project' }));
      return false;
    }
  }, []);

  // Duplicate project
  const duplicateProject = useCallback(async (
    id: string,
    newName?: string
  ): Promise<ProjectMeta | null> => {
    setState(prev => ({ ...prev, error: null }));

    try {
      const project = await projectApi.duplicate(id, newName);
      setState(prev => ({
        ...prev,
        // Filter out any existing project with the same ID to prevent duplicates
        projects: [project, ...prev.projects.filter(p => p.id !== project.id)],
      }));
      return project;
    } catch (_err) {
      setState(prev => ({ ...prev, error: 'Failed to duplicate project' }));
      return null;
    }
  }, []);

  // Update files (LOCAL ONLY - no auto-sync to backend)
  // Files sync to backend only on COMMIT (git-centric approach)
  const updateFiles = useCallback((files: FileSystem) => {
    // Just update local state - no backend sync
    setState(prev => ({ ...prev, files }));
  }, []);

  // Force sync files immediately
  const syncFiles = useCallback(async (): Promise<boolean> => {
    if (!state.currentProject) {
      console.warn('[Project] Ignoring syncFiles - no current project');
      return false;
    }

    // CRITICAL: Don't sync until initialized
    if (!isInitializedRef.current) {
      console.warn('[Project] Ignoring syncFiles - not initialized yet');
      setState(prev => ({ ...prev, error: 'Cannot sync: project still initializing' }));
      return false;
    }

    // CRITICAL: Never sync empty files - protect against data loss
    const fileCount = Object.keys(state.files).length;
    if (fileCount === 0) {
      console.warn('[Project] Blocking empty files sync - would cause data loss!');
      setState(prev => ({ ...prev, error: 'Cannot sync: no files to save (data loss protection)' }));
      return false;
    }

    // Clear pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    setState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const response = await projectApi.update(state.currentProject.id, { files: state.files });

      // Check if confirmation is required
      if (response.confirmationRequired) {
        console.log('[Project] Sync requires confirmation:', response.message);
        setState(prev => ({
          ...prev,
          isSyncing: false,
          pendingSyncConfirmation: {
            files: state.files,
            existingFileCount: response.existingFileCount || 0,
            newFileCount: response.newFileCount || 0,
            message: response.message || 'Significant file reduction detected. Do you want to continue?'
          }
        }));
        return false; // Not synced yet, waiting for confirmation
      }

      // Check if blocked
      if (response.blocked) {
        console.warn('[Project] Sync blocked:', response.warning);
        setState(prev => ({ ...prev, isSyncing: false, error: response.warning || 'Sync blocked by server' }));
        return false;
      }

      lastFilesRef.current = JSON.stringify(state.files);
      setState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));
      return true;
    } catch (_err) {
      setState(prev => ({
        ...prev,
        isSyncing: false,
        error: 'Failed to sync files',
      }));
      return false;
    }
  }, [state.currentProject, state.files]);

  // Initialize git
  // force=true will delete and reinitialize corrupted repos
  // filesToSync: current working files to sync before init
  const initGit = useCallback(async (force = false, filesToSync?: FileSystem): Promise<boolean> => {
    console.log('[Project] initGit called with force:', force);

    if (!state.currentProject) {
      console.warn('[Project] initGit failed - no current project');
      return false;
    }

    const files = filesToSync || state.files;
    const fileCount = Object.keys(files).length;

    if (fileCount === 0) {
      console.warn('[Project] Cannot init git with empty files');
      setState(prev => ({ ...prev, error: 'Cannot initialize: no files' }));
      return false;
    }

    setState(prev => ({ ...prev, error: null, isSyncing: true }));

    try {
      // Step 1: Sync files to backend first (force=true to bypass confirmation)
      console.log('[Project] initGit - syncing', fileCount, 'files first...');
      const syncResponse = await projectApi.update(state.currentProject.id, { files, force: true });
      if (syncResponse.blocked) {
        console.error('[Project] Sync blocked before git init:', syncResponse.warning);
        setState(prev => ({ ...prev, isSyncing: false, error: 'Sync blocked: ' + syncResponse.warning }));
        return false;
      }
      console.log('[Project] initGit - files synced');

      // Step 2: Initialize git (force=true for corrupted repos)
      console.log('[Project] initGit - calling gitApi.init...');
      await gitApi.init(state.currentProject.id, force);
      console.log('[Project] initGit - git initialized successfully');

      // Step 3: Refresh status - gitStatus.initialized will now be true
      console.log('[Project] initGit - refreshing git status...');
      const gitStatus = await gitApi.status(state.currentProject.id);
      console.log('[Project] initGit - got status:', gitStatus);

      setState(prev => ({
        ...prev,
        gitStatus,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));

      return true;
    } catch (_err) {
      console.error('[Project] initGit failed:', _err);
      setState(prev => ({ ...prev, isSyncing: false, error: 'Failed to initialize git' }));
      return false;
    }
  }, [state.currentProject, state.files]);

  // Create commit - syncs files to backend first, then commits
  // This is the ONLY time files are synced to backend (git-centric approach)
  const commit = useCallback(async (message: string, filesToCommit?: FileSystem): Promise<boolean> => {
    if (!state.currentProject || !state.gitStatus?.initialized) return false;

    const files = filesToCommit || state.files;
    const fileCount = Object.keys(files).length;

    if (fileCount === 0) {
      console.warn('[Project] Cannot commit empty files');
      setState(prev => ({ ...prev, error: 'Cannot commit: no files' }));
      return false;
    }

    setState(prev => ({ ...prev, error: null, isSyncing: true }));

    try {
      console.log('[Project] Committing', fileCount, 'files...');

      // Step 1: Sync files to backend (force=true to bypass confirmation)
      const syncResponse = await projectApi.update(state.currentProject.id, { files, force: true });
      if (syncResponse.blocked) {
        console.error('[Project] Sync blocked before commit:', syncResponse.warning);
        setState(prev => ({ ...prev, isSyncing: false, error: 'Sync blocked: ' + syncResponse.warning }));
        return false;
      }
      console.log('[Project] Files synced to backend');

      // Step 2: Git commit
      await gitApi.commit(state.currentProject.id, message, files);
      console.log('[Project] Git commit created');

      // Step 3: Refresh status
      const gitStatus = await gitApi.status(state.currentProject.id);
      setState(prev => ({
        ...prev,
        gitStatus,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));

      console.log('[Project] Commit complete!');
      return true;
    } catch (_err) {
      console.error('[Project] Commit failed:', _err);
      setState(prev => ({ ...prev, isSyncing: false, error: 'Failed to create commit' }));
      return false;
    }
  }, [state.currentProject, state.gitStatus?.initialized, state.files]);

  // Refresh git status - this is the single source of truth for git state
  const refreshGitStatus = useCallback(async () => {
    if (!state.currentProject) return;

    try {
      const gitStatus = await gitApi.status(state.currentProject.id);
      console.log('[Project] Git status response:', gitStatus);

      setState(prev => ({
        ...prev,
        gitStatus,
      }));
    } catch (_err) {
      console.error('[Project] Failed to refresh git status:', _err);
      // On error, keep current gitStatus - don't reset to null
    }
  }, [state.currentProject]);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Save context (including version history) to backend
  const saveContext = useCallback(async (context: Partial<ProjectContext>): Promise<boolean> => {
    if (!state.currentProject) {
      console.warn('[Project] Cannot save context - no current project');
      return false;
    }

    try {
      await projectApi.saveContext(state.currentProject.id, context);
      console.log('[Project] Saved context for project:', state.currentProject.name);
      return true;
    } catch (_err) {
      console.error('[Project] Failed to save context:', _err);
      return false;
    }
  }, [state.currentProject]);

  // Get context from backend for current project
  const getContext = useCallback(async (): Promise<ProjectContext | null> => {
    if (!state.currentProject) {
      return null;
    }

    try {
      return await projectApi.getContext(state.currentProject.id);
    } catch {
      return null;
    }
  }, [state.currentProject]);

  // Confirm pending sync (force update after user confirmation)
  const confirmPendingSync = useCallback(async (): Promise<boolean> => {
    if (!state.currentProject || !state.pendingSyncConfirmation) {
      return false;
    }

    const { files } = state.pendingSyncConfirmation;

    setState(prev => ({ ...prev, isSyncing: true, pendingSyncConfirmation: null }));

    try {
      // Send with force=true to bypass the confirmation check
      const response = await projectApi.update(state.currentProject.id, { files, force: true });

      if (response.blocked) {
        console.warn('[Project] Force sync still blocked:', response.warning);
        setState(prev => ({ ...prev, isSyncing: false, error: response.warning || 'Force sync blocked' }));
        return false;
      }

      lastFilesRef.current = JSON.stringify(files);
      setState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));
      console.log('[Project] Force sync completed after confirmation');
      return true;
    } catch (_err) {
      setState(prev => ({
        ...prev,
        isSyncing: false,
        error: 'Failed to sync files',
      }));
      return false;
    }
  }, [state.currentProject, state.pendingSyncConfirmation]);

  // Cancel pending sync
  const cancelPendingSync = useCallback(() => {
    setState(prev => ({ ...prev, pendingSyncConfirmation: null }));
    console.log('[Project] Pending sync cancelled by user');
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
    createProject,
    openProject,
    closeProject,
    deleteProject,
    duplicateProject,
    refreshProjects,
    updateFiles,
    syncFiles,
    initGit,
    commit,
    refreshGitStatus,
    saveContext,
    getContext,
    confirmPendingSync,
    cancelPendingSync,
    clearError,
  };
}

export default useProject;
