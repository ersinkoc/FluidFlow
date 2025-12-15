/**
 * useProjectManagement Hook
 *
 * Handles project CRUD operations: create, open, close, delete, duplicate, list.
 * Extracted from useProject for better separation of concerns.
 */

import { useState, useCallback, useRef } from 'react';
import { projectApi, gitApi, ProjectMeta, GitStatus, ProjectContext } from '@/services/projectApi';
import type { FileSystem } from '@/types';

// Re-export types for use in other components
export type { ProjectContext, HistoryEntry } from '@/services/projectApi';

export interface ProjectManagementState {
  currentProject: ProjectMeta | null;
  files: FileSystem;
  projects: ProjectMeta[];
  isLoadingProjects: boolean;
  gitStatus: GitStatus | null;
  isInitialized: boolean;
  error: string | null;
}

export interface UseProjectManagementReturn extends ProjectManagementState {
  /** Create a new project */
  createProject: (
    name?: string,
    description?: string,
    initialFiles?: FileSystem
  ) => Promise<ProjectMeta | null>;
  /** Open an existing project */
  openProject: (
    id: string
  ) => Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }>;
  /** Close current project */
  closeProject: () => void;
  /** Delete a project */
  deleteProject: (id: string) => Promise<boolean>;
  /** Duplicate a project */
  duplicateProject: (id: string, newName?: string) => Promise<ProjectMeta | null>;
  /** Refresh projects list */
  refreshProjects: () => Promise<void>;
  /** Update files locally */
  setFiles: (files: FileSystem) => void;
  /** Set git status */
  setGitStatus: (status: GitStatus | null) => void;
  /** Clear error */
  clearError: () => void;
}

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

interface UseProjectManagementConfig {
  onFilesChange?: (files: FileSystem) => void;
  onResetAutoSave?: () => void;
}

/**
 * Hook to manage project CRUD operations
 *
 * @param config - Configuration callbacks
 *
 * @example
 * ```tsx
 * const {
 *   currentProject,
 *   files,
 *   projects,
 *   createProject,
 *   openProject,
 * } = useProjectManagement({
 *   onFilesChange: (files) => console.log('Files changed:', files),
 * });
 *
 * // Create new project
 * await createProject('My App', 'A new app');
 *
 * // Open existing project
 * await openProject(projectId);
 * ```
 */
export function useProjectManagement(
  config: UseProjectManagementConfig = {}
): UseProjectManagementReturn {
  const { onFilesChange, onResetAutoSave } = config;

  const [state, setState] = useState<ProjectManagementState>({
    currentProject: null,
    files: {},
    projects: [],
    isLoadingProjects: false,
    gitStatus: null,
    isInitialized: false,
    error: null,
  });

  const lastFilesRef = useRef<string>('');
  const restoreAbortedRef = useRef<boolean>(false);
  const openProjectIdRef = useRef<string | null>(null);

  // Refresh projects list
  const refreshProjects = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoadingProjects: true, error: null }));

    try {
      const projects = await projectApi.list();
      setState((prev) => ({ ...prev, projects, isLoadingProjects: false }));
    } catch (err) {
      console.error('[ProjectMgmt] Failed to load projects:', err);
      setState((prev) => ({
        ...prev,
        isLoadingProjects: false,
        error: 'Failed to load projects',
      }));
    }
  }, []);

  // Create new project
  const createProject = useCallback(
    async (
      name?: string,
      description?: string,
      initialFiles?: FileSystem
    ): Promise<ProjectMeta | null> => {
      // Abort any in-flight restore operation
      restoreAbortedRef.current = true;

      setState((prev) => ({ ...prev, error: null }));

      try {
        const project = await projectApi.create({
          name: name || 'Untitled Project',
          description,
          files: initialFiles,
        });

        setState((prev) => ({
          ...prev,
          currentProject: project,
          files: project.files || {},
          // Filter out any existing project with the same ID to prevent duplicates
          projects: [project, ...prev.projects.filter((p) => p.id !== project.id)],
          gitStatus: null, // Will be fetched on demand
          isInitialized: true,
        }));

        // Save project ID to localStorage for persistence
        storage.setProjectId(project.id);

        lastFilesRef.current = JSON.stringify(project.files || {});
        onFilesChange?.(project.files || {});

        return project;
      } catch (err) {
        console.error('[ProjectMgmt] Failed to create project:', err);
        setState((prev) => ({ ...prev, error: 'Failed to create project' }));
        return null;
      }
    },
    [onFilesChange]
  );

  // Open existing project - returns files directly to avoid stale closure issues
  const openProject = useCallback(
    async (
      id: string
    ): Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }> => {
      // IMPORTANT: Abort any in-flight restore operation
      restoreAbortedRef.current = true;

      // Track this operation - used to detect if a newer openProject was called
      openProjectIdRef.current = id;

      // Reset auto-save from previous project
      onResetAutoSave?.();

      setState((prev) => ({ ...prev, error: null, isInitialized: false }));

      try {
        // Fetch project and context in parallel
        const [project, savedContext] = await Promise.all([
          projectApi.get(id),
          projectApi.getContext(id).catch(() => null), // Don't fail if context doesn't exist
        ]);

        // Check if a newer openProject call was made while we were fetching
        if (openProjectIdRef.current !== id) {
          console.log('[ProjectMgmt] openProject aborted - newer request in progress');
          return { success: false, files: {}, context: null };
        }

        const projectFiles = project.files || {};

        setState((prev) => ({
          ...prev,
          currentProject: project,
          files: projectFiles,
          isInitialized: true,
          // Reset git status - will be fetched fresh
          gitStatus: null,
        }));

        // Save project ID to localStorage for persistence
        storage.setProjectId(id);

        // Set lastFilesRef BEFORE enabling sync to prevent old files from syncing
        lastFilesRef.current = JSON.stringify(projectFiles);

        // Refresh git status async - single source of truth
        gitApi
          .status(id)
          .then((gitStatus) => {
            // Only update if this project is still the current one
            if (openProjectIdRef.current === id) {
              setState((prev) => ({
                ...prev,
                gitStatus,
              }));
            }
          })
          .catch((error) => {
            // Git might not be initialized - gitStatus stays null
            if (openProjectIdRef.current === id) {
              console.debug(
                '[ProjectMgmt] Git status refresh skipped (not initialized or error):',
                error?.message || error
              );
            }
          });

        console.log(
          '[ProjectMgmt] Opened project:',
          project.name,
          'with',
          Object.keys(projectFiles).length,
          'files'
        );
        if (savedContext?.history?.length) {
          console.log(
            '[ProjectMgmt] Loaded context with',
            savedContext.history.length,
            'history entries'
          );
        }

        return { success: true, files: projectFiles, context: savedContext };
      } catch (err) {
        // Only handle error if this is still the current operation
        if (openProjectIdRef.current === id) {
          console.error('[ProjectMgmt] Failed to open project:', err);
          setState((prev) => ({
            ...prev,
            isInitialized: true,
            error: 'Failed to open project',
          }));
        }
        return { success: false, files: {}, context: null };
      }
    },
    [onResetAutoSave]
  );

  // Close current project
  const closeProject = useCallback(() => {
    // Reset auto-save
    onResetAutoSave?.();

    // Clear localStorage
    storage.setProjectId(null);

    setState((prev) => ({
      ...prev,
      currentProject: null,
      files: {},
      gitStatus: null,
    }));

    lastFilesRef.current = '';
  }, [onResetAutoSave]);

  // Delete project
  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, error: null }));

    try {
      await projectApi.delete(id);

      // Clear localStorage if deleting current project
      const savedId = storage.getProjectId();
      if (savedId === id) {
        storage.setProjectId(null);
      }

      setState((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== id),
        // Close if current project was deleted
        ...(prev.currentProject?.id === id
          ? {
              currentProject: null,
              files: {},
              gitStatus: null,
            }
          : {}),
      }));

      return true;
    } catch (err) {
      console.error('[ProjectMgmt] Failed to delete project:', err);
      setState((prev) => ({ ...prev, error: 'Failed to delete project' }));
      return false;
    }
  }, []);

  // Duplicate project
  const duplicateProject = useCallback(
    async (id: string, newName?: string): Promise<ProjectMeta | null> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const project = await projectApi.duplicate(id, newName);
        setState((prev) => ({
          ...prev,
          // Filter out any existing project with the same ID to prevent duplicates
          projects: [project, ...prev.projects.filter((p) => p.id !== project.id)],
        }));
        return project;
      } catch (err) {
        console.error('[ProjectMgmt] Failed to duplicate project:', err);
        setState((prev) => ({ ...prev, error: 'Failed to duplicate project' }));
        return null;
      }
    },
    []
  );

  // Set files directly
  const setFiles = useCallback((files: FileSystem) => {
    setState((prev) => ({ ...prev, files }));
  }, []);

  // Set git status directly
  const setGitStatus = useCallback((status: GitStatus | null) => {
    setState((prev) => ({ ...prev, gitStatus: status }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    createProject,
    openProject,
    closeProject,
    deleteProject,
    duplicateProject,
    refreshProjects,
    setFiles,
    setGitStatus,
    clearError,
  };
}

// Export storage utilities for project restoration
export const projectStorage = storage;

export default useProjectManagement;
