/**
 * AppContext - Centralized state management to reduce prop drilling
 *
 * This context provides shared state across the application:
 * - Files state (files, activeFile, setters)
 * - Project state (currentProject, projects, operations)
 * - Git state (status, operations, uncommitted changes)
 * - History/undo-redo
 * - Diff/Review state
 *
 * UI state (tabs, generating, suggestions, models) is now managed by UIContext.
 * AppContext consumes UIContext internally for backwards compatibility.
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileSystem, TabType } from '../types';
import { ProjectMeta, GitStatus as GitStatusResult } from '../services/projectApi';
import { useProject, PendingSyncConfirmation } from '../hooks/useProject';
import { useVersionHistory, HistoryEntry } from '../hooks/useVersionHistory';
import { safeJsonParse } from '../utils/safeJson';
import { gitApi, projectApi } from '../services/projectApi';
import { getWIP, saveWIP, clearWIP, WIPData, SCRATCH_WIP_ID } from '../services/wipStorage';
import { clearFileTracker } from '../services/context/fileContextTracker';
import { isIgnoredPath } from '../utils/filePathUtils';
import { useUI } from './UIContext';
// Note: UIContext is used internally for operations that need UI state,
// but UI state is NOT re-exported. Components should use useUI() directly.

// ============ Types ============

export interface AppContextValue {
  // Files state
  files: FileSystem;
  setFiles: (files: FileSystem | ((prev: FileSystem) => FileSystem), label?: string) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;

  // History/undo-redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry[];
  historyLength: number;
  currentIndex: number;
  goToIndex: (index: number) => void;
  saveSnapshot: (name: string) => void;
  resetFiles: (files: FileSystem) => void;
  exportHistory: () => { history: HistoryEntry[]; currentIndex: number };
  restoreHistory: (history: HistoryEntry[], currentIndex: number) => void;

  // Project state
  currentProject: ProjectMeta | null;
  projects: ProjectMeta[];
  isServerOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isLoadingProjects: boolean;
  isInitialized: boolean;

  // Project operations
  createProject: (name: string, description?: string, initialFiles?: FileSystem) => Promise<ProjectMeta | null>;
  openProject: (id: string) => Promise<{ success: boolean; files: FileSystem; context?: AppUIContext }>;
  deleteProject: (id: string) => Promise<boolean>;
  duplicateProject: (id: string, newName?: string) => Promise<ProjectMeta | null>;
  refreshProjects: () => Promise<void>;
  closeProject: () => void;
  syncFiles: () => Promise<boolean>;
  saveContext: (context: AppUIContext) => Promise<boolean>;

  // Git state
  gitStatus: GitStatusResult | null;
  hasUncommittedChanges: boolean;
  localChanges: { path: string; status: 'added' | 'modified' | 'deleted' }[];

  // Git operations
  initGit: (force?: boolean) => Promise<boolean>;
  commit: (message: string) => Promise<boolean>;
  refreshGitStatus: () => Promise<void>;
  discardChanges: () => Promise<void>;
  revertToCommit: (commitHash: string) => Promise<boolean>;

  // Diff/Review
  pendingReview: { label: string; newFiles: FileSystem; skipHistory?: boolean; incompleteFiles?: string[] } | null;
  reviewChange: (label: string, newFiles: FileSystem, options?: { skipHistory?: boolean; incompleteFiles?: string[] }) => void;
  confirmChange: () => void;
  cancelReview: () => void;

  // Sync confirmation
  pendingSyncConfirmation: PendingSyncConfirmation | null;
  confirmPendingSync: () => Promise<boolean>;
  cancelPendingSync: () => void;

  // Reset
  resetApp: () => void;
}

export interface AppUIContext {
  history?: HistoryEntry[];
  currentIndex?: number;
  activeFile?: string;
  activeTab?: string;
}

// ============ Context ============

const AppContext = createContext<AppContextValue | null>(null);

// ============ Provider Props ============

interface AppProviderProps {
  children: React.ReactNode;
  defaultFiles: FileSystem;
}

// ============ Provider ============

export function AppProvider({ children, defaultFiles }: AppProviderProps) {
  // Backend project management
  const project = useProject();

  // UI state from UIContext - only destructure what's needed internally
  const {
    activeTab, setActiveTab,  // For WIP save/restore
    setSuggestions,           // For openProject
    autoAcceptChanges,        // For reviewChange
    resetUIState,             // For resetApp
  } = useUI();

  // Local version history
  const {
    files, setFiles, undo, redo, canUndo, canRedo, reset: resetFiles,
    history, currentIndex, goToIndex, saveSnapshot, historyLength,
    exportHistory, restoreHistory
  } = useVersionHistory(project.currentProject ? project.files : defaultFiles);

  // Files state - activeFile is local since it's file-related
  const [activeFile, setActiveFile] = useState<string>('src/App.tsx');

  // Track uncommitted changes (WIP)
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);
  const lastCommittedFilesRef = useRef<string>('');

  // Initialization tracking
  const hasInitializedFromBackend = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  const isSwitchingProjectRef = useRef(false);
  const hasRestoredScratchWIP = useRef(false);

  // Diff Review State
  const [pendingReview, setPendingReview] = useState<{
    label: string;
    newFiles: FileSystem;
    skipHistory?: boolean;
    /** Files that were started but not completed by AI (excluded from merge) */
    incompleteFiles?: string[];
  } | null>(null);

  // Calculate local changes for display
  const localChanges = useMemo(() => {
    if (!hasUncommittedChanges || !lastCommittedFilesRef.current) return [];

    try {
      const committedFiles = safeJsonParse(lastCommittedFilesRef.current, {} as FileSystem);
      const changes: { path: string; status: 'added' | 'modified' | 'deleted' }[] = [];

      Object.keys(files).forEach(path => {
        if (isIgnoredPath(path)) return;
        if (!committedFiles[path]) {
          changes.push({ path, status: 'added' });
        } else if (committedFiles[path] !== files[path]) {
          changes.push({ path, status: 'modified' });
        }
      });

      Object.keys(committedFiles).forEach(path => {
        if (isIgnoredPath(path)) return;
        if (!files[path]) {
          changes.push({ path, status: 'deleted' });
        }
      });

      return changes;
    } catch {
      return [];
    }
  }, [files, hasUncommittedChanges]);

  // Initialize from backend when project changes
  useEffect(() => {
    const currentId = project.currentProject?.id ?? null;

    if (currentId !== lastProjectIdRef.current) {
      hasInitializedFromBackend.current = false;
      lastProjectIdRef.current = currentId;
    }

    if (project.isInitialized && project.currentProject && !hasInitializedFromBackend.current) {
      hasInitializedFromBackend.current = true;
      // Capture project id before async function to satisfy TypeScript null check
      const currentProjectId = project.currentProject.id;

      const restoreWithWIP = async () => {
        try {
          const wip = await getWIP(currentProjectId);
          lastCommittedFilesRef.current = JSON.stringify(project.files);

          if (wip && wip.files && Object.keys(wip.files).length > 0) {
            console.log('[AppContext] Restoring WIP:', Object.keys(wip.files).length, 'files');
            resetFiles(wip.files);
            setHasUncommittedChanges(true);
            if (wip.activeFile && wip.files[wip.activeFile]) {
              setActiveFile(wip.activeFile);
            }
            if (wip.activeTab) {
              setActiveTab(wip.activeTab as TabType);
            }
          } else {
            const backendFileCount = Object.keys(project.files).length;
            if (backendFileCount > 0) {
              resetFiles(project.files);
            }
            setHasUncommittedChanges(false);
          }
        } catch (err) {
          console.warn('[AppContext] WIP restore failed:', err);
          if (Object.keys(project.files).length > 0) {
            resetFiles(project.files);
          }
          lastCommittedFilesRef.current = JSON.stringify(project.files);
          setHasUncommittedChanges(false);
        }
      };

      restoreWithWIP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when project id changes, not on every currentProject property change
  }, [project.isInitialized, project.currentProject?.id, project.files, resetFiles]);

  // Restore scratch WIP when no project is selected (on mount)
  useEffect(() => {
    // Only restore scratch WIP once, and only if no project is selected
    if (hasRestoredScratchWIP.current || project.currentProject) return;

    // Wait for project initialization to complete
    if (!project.isInitialized) return;

    hasRestoredScratchWIP.current = true;

    const restoreScratchWIP = async () => {
      try {
        const scratchWip = await getWIP(SCRATCH_WIP_ID);

        if (scratchWip && scratchWip.files && Object.keys(scratchWip.files).length > 0) {
          console.log('[AppContext] Restoring scratch WIP:', Object.keys(scratchWip.files).length, 'files');
          resetFiles(scratchWip.files);

          if (scratchWip.activeFile && scratchWip.files[scratchWip.activeFile]) {
            setActiveFile(scratchWip.activeFile);
          }
          if (scratchWip.activeTab) {
            setActiveTab(scratchWip.activeTab as TabType);
          }
        }
      } catch (err) {
        console.warn('[AppContext] Scratch WIP restore failed:', err);
      }
    };

    restoreScratchWIP();
  }, [project.isInitialized, project.currentProject, resetFiles, setActiveTab]);

  // Save WIP to IndexedDB when files change
  useEffect(() => {
    // Save to project WIP or scratch WIP depending on context
    const wipId = project.currentProject?.id || SCRATCH_WIP_ID;

    // For project WIP, wait for initialization
    if (project.currentProject && !hasInitializedFromBackend.current) return;

    // Don't save empty files
    if (Object.keys(files).length === 0) return;

    // Track uncommitted changes for project mode
    if (project.currentProject) {
      const currentFilesJson = JSON.stringify(files);
      const hasChanges = lastCommittedFilesRef.current !== '' &&
                         currentFilesJson !== lastCommittedFilesRef.current;
      setHasUncommittedChanges(hasChanges);
    }

    const timeout = setTimeout(() => {
      const wipData: WIPData = {
        id: wipId,
        files,
        activeFile,
        activeTab,
        savedAt: Date.now()
      };
      saveWIP(wipData);
    }, 1000);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only track project id, not full currentProject object
  }, [files, activeFile, activeTab, project.currentProject?.id]);

  // Review change handler
  const reviewChange = useCallback((
    label: string,
    newFiles: FileSystem,
    options?: { skipHistory?: boolean; incompleteFiles?: string[] }
  ) => {
    if (autoAcceptChanges) {
      // Log warning if there are incomplete files
      if (options?.incompleteFiles && options.incompleteFiles.length > 0) {
        console.warn('[reviewChange] Auto-accepting changes with incomplete files:', options.incompleteFiles);
      }
      // Pass skipHistory option to setFiles
      setFiles(newFiles, options?.skipHistory ? { skipHistory: true } : undefined);
      if (!newFiles[activeFile]) {
        const firstSrc = Object.keys(newFiles).find(f => f.startsWith('src/'));
        setActiveFile(firstSrc || 'package.json');
      }
    } else {
      setPendingReview({
        label,
        newFiles,
        skipHistory: options?.skipHistory,
        incompleteFiles: options?.incompleteFiles,
      });
    }
  }, [autoAcceptChanges, activeFile, setFiles]);

  const confirmChange = useCallback(() => {
    if (pendingReview) {
      // Respect skipHistory option from pending review
      setFiles(
        pendingReview.newFiles,
        pendingReview.skipHistory ? { skipHistory: true } : undefined
      );
      if (!pendingReview.newFiles[activeFile]) {
        const firstSrc = Object.keys(pendingReview.newFiles).find(f => f.startsWith('src/'));
        setActiveFile(firstSrc || 'package.json');
      }
      setPendingReview(null);
    }
  }, [pendingReview, activeFile, setFiles]);

  const cancelReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  // Git operations with WIP handling
  const initGit = useCallback(async (force?: boolean) => {
    const success = await project.initGit(force, files);
    if (success && project.currentProject) {
      await clearWIP(project.currentProject.id);
      lastCommittedFilesRef.current = JSON.stringify(files);
      setHasUncommittedChanges(false);
    }
    return success;
  }, [project, files]);

  const commit = useCallback(async (message: string) => {
    const success = await project.commit(message, files);
    if (success && project.currentProject) {
      await clearWIP(project.currentProject.id);
      lastCommittedFilesRef.current = JSON.stringify(files);
      setHasUncommittedChanges(false);
    }
    return success;
  }, [project, files]);

  const discardChanges = useCallback(async () => {
    if (!project.currentProject) return;

    try {
      if (lastCommittedFilesRef.current) {
        const committedFiles = safeJsonParse(lastCommittedFilesRef.current, {} as FileSystem);
        resetFiles(committedFiles);
        await clearWIP(project.currentProject.id);
        setHasUncommittedChanges(false);

        if (!committedFiles[activeFile]) {
          const firstSrc = Object.keys(committedFiles).find(f => f.startsWith('src/'));
          setActiveFile(firstSrc || 'package.json');
        }
      }
    } catch (err) {
      console.error('[AppContext] Discard failed:', err);
    }
  }, [project.currentProject, activeFile, resetFiles]);

  const revertToCommit = useCallback(async (commitHash: string): Promise<boolean> => {
    if (!project.currentProject) return false;

    try {
      await gitApi.checkout(project.currentProject.id, commitHash);
      const result = await projectApi.get(project.currentProject.id);

      if (result.files) {
        resetFiles(result.files);
        lastCommittedFilesRef.current = JSON.stringify(result.files);
      }

      await clearWIP(project.currentProject.id);
      setHasUncommittedChanges(false);
      await project.refreshGitStatus();

      if (result.files && !result.files[activeFile]) {
        const firstSrc = Object.keys(result.files).find(f => f.startsWith('src/'));
        setActiveFile(firstSrc || 'package.json');
      }

      return true;
    } catch (err) {
      console.error('[AppContext] Revert failed:', err);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only track specific project properties, not full object
  }, [project.currentProject, activeFile, resetFiles, project.refreshGitStatus]);

  // Project operations with WIP handling
  const createProject = useCallback(async (name: string, description?: string, initialFiles?: FileSystem) => {
    // Use provided initialFiles or fall back to current files state
    const filesToUse = initialFiles ?? files;
    const result = await project.createProject(name, description, filesToUse);
    if (result) {
      // Clear scratch WIP when project is created (scratch work is now part of project)
      clearWIP(SCRATCH_WIP_ID).catch(console.warn);
    }
    return result;
  }, [project, files]);

  const openProject = useCallback(async (id: string) => {
    if (isSwitchingProjectRef.current) {
      console.log('[AppContext] Project switch in progress, ignoring');
      return { success: false, files: {} };
    }
    isSwitchingProjectRef.current = true;

    // Clear file context tracker for new project (AI doesn't know files yet)
    clearFileTracker('main-chat');

    try {
      // Save current context
      if (project.currentProject) {
        const { history: historyToSave, currentIndex: indexToSave } = exportHistory();
        await project.saveContext({
          history: historyToSave,
          currentIndex: indexToSave,
          activeFile,
          activeTab,
        });
      } else {
        // Clear scratch WIP when opening a project (scratch work is transferred)
        clearWIP(SCRATCH_WIP_ID).catch(console.warn);
      }

      const result = await project.openProject(id);

      if (result.success) {
        const wip = await getWIP(id);
        let currentFiles = result.files;
        let restoredFromWIP = false;

        if (wip && wip.files && Object.keys(wip.files).length > 0) {
          currentFiles = wip.files;
          resetFiles(wip.files);
          restoredFromWIP = true;

          if (wip.activeFile && wip.files[wip.activeFile]) {
            setActiveFile(wip.activeFile);
          }
          if (wip.activeTab) {
            setActiveTab(wip.activeTab as TabType);
          }
        } else if (result.context?.history && result.context.history.length > 0) {
          restoreHistory(result.context.history, result.context.currentIndex);
          const currentHistoryEntry = result.context.history[result.context.currentIndex];
          if (currentHistoryEntry?.files) {
            currentFiles = currentHistoryEntry.files;
          }
        } else {
          resetFiles(result.files);
        }

        if (!restoredFromWIP) {
          if (result.context?.activeFile && currentFiles[result.context.activeFile]) {
            setActiveFile(result.context.activeFile);
          } else {
            const firstSrc = Object.keys(currentFiles).find(f => f.startsWith('src/'));
            setActiveFile(firstSrc || 'package.json');
          }
          if (result.context?.activeTab) {
            setActiveTab(result.context.activeTab as TabType);
          }
        }

        setSuggestions(null);
        setPendingReview(null);
      }

      return result;
    } finally {
      isSwitchingProjectRef.current = false;
    }
  }, [project, activeFile, activeTab, exportHistory, restoreHistory, resetFiles, setActiveTab, setSuggestions]);

  // Reset app - comprehensive reset including project close and WIP clear
  const resetApp = useCallback(() => {
    // Close project if open (this clears project state)
    if (project.currentProject) {
      // Clear WIP for this project (fire and forget)
      clearWIP(project.currentProject.id).catch(console.warn);
      project.closeProject();
    } else {
      // Clear scratch WIP if no project
      clearWIP(SCRATCH_WIP_ID).catch(console.warn);
    }

    // Reset version history to default files
    resetFiles(defaultFiles);

    // Reset active file
    setActiveFile('src/App.tsx');

    // Reset uncommitted changes tracking
    lastCommittedFilesRef.current = '';
    setHasUncommittedChanges(false);
    hasInitializedFromBackend.current = false;
    hasRestoredScratchWIP.current = false;

    // Clear pending review
    setPendingReview(null);

    // Reset UI state (tabs, generating, suggestions, etc.)
    resetUIState();

    // Clear browser console
    console.clear();
    console.log('[AppContext] Full reset completed');
  }, [defaultFiles, resetFiles, resetUIState, project]);

  // Context value
  const value = useMemo<AppContextValue>(() => ({
    // Files state
    files,
    setFiles,
    activeFile,
    setActiveFile,

    // History
    undo,
    redo,
    canUndo,
    canRedo,
    history,
    historyLength,
    currentIndex,
    goToIndex,
    saveSnapshot,
    resetFiles,
    exportHistory,
    restoreHistory,

    // Project state
    currentProject: project.currentProject,
    projects: project.projects,
    isServerOnline: project.isServerOnline,
    isSyncing: project.isSyncing,
    lastSyncedAt: project.lastSyncedAt,
    isLoadingProjects: project.isLoadingProjects,
    isInitialized: project.isInitialized,

    // Project operations
    createProject,
    openProject,
    deleteProject: project.deleteProject,
    duplicateProject: project.duplicateProject,
    refreshProjects: project.refreshProjects,
    closeProject: project.closeProject,
    syncFiles: project.syncFiles,
    saveContext: project.saveContext,

    // Git state
    gitStatus: project.gitStatus,
    hasUncommittedChanges,
    localChanges,

    // Git operations
    initGit,
    commit,
    refreshGitStatus: project.refreshGitStatus,
    discardChanges,
    revertToCommit,

    // Diff/Review
    pendingReview,
    reviewChange,
    confirmChange,
    cancelReview,

    // Sync confirmation
    pendingSyncConfirmation: project.pendingSyncConfirmation,
    confirmPendingSync: project.confirmPendingSync,
    cancelPendingSync: project.cancelPendingSync,

    // Reset
    resetApp,
  }), [
    files, setFiles, activeFile, undo, redo, canUndo, canRedo,
    history, historyLength, currentIndex, goToIndex, saveSnapshot,
    resetFiles, exportHistory, restoreHistory,
    project, createProject, openProject, initGit, commit, discardChanges, revertToCommit,
    hasUncommittedChanges, localChanges,
    pendingReview, reviewChange, confirmChange, cancelReview, resetApp
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

// ============ Hook ============

// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

// ============ Selective Hooks ============
// These allow components to subscribe to specific slices of state
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useFiles() {
  const { files, setFiles, activeFile, setActiveFile } = useAppContext();
  return { files, setFiles, activeFile, setActiveFile };
}

// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useProject2() {
  const ctx = useAppContext();
  return {
    currentProject: ctx.currentProject,
    projects: ctx.projects,
    isServerOnline: ctx.isServerOnline,
    isSyncing: ctx.isSyncing,
    lastSyncedAt: ctx.lastSyncedAt,
    isLoadingProjects: ctx.isLoadingProjects,
    createProject: ctx.createProject,
    openProject: ctx.openProject,
    deleteProject: ctx.deleteProject,
    duplicateProject: ctx.duplicateProject,
    refreshProjects: ctx.refreshProjects,
    closeProject: ctx.closeProject,
    syncFiles: ctx.syncFiles,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useGit() {
  const ctx = useAppContext();
  return {
    gitStatus: ctx.gitStatus,
    hasUncommittedChanges: ctx.hasUncommittedChanges,
    localChanges: ctx.localChanges,
    initGit: ctx.initGit,
    commit: ctx.commit,
    refreshGitStatus: ctx.refreshGitStatus,
    discardChanges: ctx.discardChanges,
    revertToCommit: ctx.revertToCommit,
  };
}

/**
 * @deprecated Use useUI() from UIContext instead for better performance
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useUIState() {
  // Redirect to UIContext for backwards compatibility
  const ui = useUI();
  return {
    activeTab: ui.activeTab,
    setActiveTab: ui.setActiveTab,
    isGenerating: ui.isGenerating,
    setIsGenerating: ui.setIsGenerating,
    suggestions: ui.suggestions,
    setSuggestions: ui.setSuggestions,
    selectedModel: ui.selectedModel,
    setSelectedModel: ui.setSelectedModel,
    autoAcceptChanges: ui.autoAcceptChanges,
    setAutoAcceptChanges: ui.setAutoAcceptChanges,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useHistory() {
  const ctx = useAppContext();
  return {
    undo: ctx.undo,
    redo: ctx.redo,
    canUndo: ctx.canUndo,
    canRedo: ctx.canRedo,
    history: ctx.history,
    historyLength: ctx.historyLength,
    currentIndex: ctx.currentIndex,
    goToIndex: ctx.goToIndex,
    saveSnapshot: ctx.saveSnapshot,
  };
}
