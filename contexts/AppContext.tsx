/**
 * AppContext - Centralized state management to reduce prop drilling
 *
 * This context provides shared state across the application:
 * - Files state (files, activeFile, setters)
 * - Project state (currentProject, projects, operations)
 * - Git state (status, operations, uncommitted changes)
 * - UI state (tabs, generating, suggestions, models)
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileSystem, TabType } from '../types';
import { ProjectMeta, GitStatus as GitStatusResult } from '../services/projectApi';
import { useProject, PendingSyncConfirmation } from '../hooks/useProject';
import { useVersionHistory, HistoryEntry } from '../hooks/useVersionHistory';
import { safeJsonParse } from '../utils/safeJson';
import { gitApi, projectApi } from '../services/projectApi';

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
  createProject: (name: string, description?: string) => Promise<ProjectMeta | null>;
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

  // UI state
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
  suggestions: string[] | null;
  setSuggestions: (suggestions: string[] | null) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  autoAcceptChanges: boolean;
  setAutoAcceptChanges: (accept: boolean) => void;
  diffModeEnabled: boolean;
  setDiffModeEnabled: (enabled: boolean) => void;

  // Diff/Review
  pendingReview: { label: string; newFiles: FileSystem } | null;
  reviewChange: (label: string, newFiles: FileSystem) => void;
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

// ============ IndexedDB WIP Storage ============

const WIP_DB_NAME = 'fluidflow-wip';
const WIP_DB_VERSION = 1;

interface WIPData {
  id: string;
  files: FileSystem;
  activeFile: string;
  activeTab: string;
  savedAt: number;
}

function openWIPDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WIP_DB_NAME, WIP_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('wip')) {
        db.createObjectStore('wip', { keyPath: 'id' });
      }
    };
  });
}

async function getWIP(projectId: string): Promise<WIPData | null> {
  try {
    const db = await openWIPDatabase();
    const tx = db.transaction('wip', 'readonly');
    const store = tx.objectStore('wip');
    return new Promise((resolve, reject) => {
      const request = store.get(projectId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch {
    return null;
  }
}

async function saveWIPData(data: WIPData): Promise<void> {
  try {
    const db = await openWIPDatabase();
    const tx = db.transaction('wip', 'readwrite');
    const store = tx.objectStore('wip');
    await store.put(data);
  } catch (err) {
    console.warn('[WIP] Failed to save:', err);
  }
}

async function clearWIP(projectId: string): Promise<void> {
  try {
    const db = await openWIPDatabase();
    const tx = db.transaction('wip', 'readwrite');
    const store = tx.objectStore('wip');
    await store.delete(projectId);
  } catch (err) {
    console.warn('[WIP] Failed to clear:', err);
  }
}

// Files/folders to ignore
const IGNORED_PATTERNS = ['.git', '.git/', 'node_modules', 'node_modules/'];
const isIgnoredPath = (filePath: string): boolean => {
  return IGNORED_PATTERNS.some(pattern =>
    filePath === pattern ||
    filePath.startsWith(pattern) ||
    filePath.startsWith('.git/') ||
    filePath.includes('/.git/') ||
    filePath.includes('/node_modules/')
  );
};

// ============ Provider ============

export function AppProvider({ children, defaultFiles }: AppProviderProps) {
  // Backend project management
  const project = useProject();

  // Local version history
  const {
    files, setFiles, undo, redo, canUndo, canRedo, reset: resetFiles,
    history, currentIndex, goToIndex, saveSnapshot, historyLength,
    exportHistory, restoreHistory
  } = useVersionHistory(project.currentProject ? project.files : defaultFiles);

  // UI State
  const [activeFile, setActiveFile] = useState<string>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [selectedModel, setSelectedModel] = useState('models/gemini-2.5-flash');
  const [autoAcceptChanges, setAutoAcceptChanges] = useState(false);
  const [diffModeEnabled, setDiffModeEnabled] = useState(() => {
    return localStorage.getItem('diffModeEnabled') === 'true';
  });

  // Persist diffModeEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('diffModeEnabled', String(diffModeEnabled));
  }, [diffModeEnabled]);

  // Track uncommitted changes (WIP)
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);
  const lastCommittedFilesRef = useRef<string>('');

  // Initialization tracking
  const hasInitializedFromBackend = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  const isSwitchingProjectRef = useRef(false);

  // Diff Review State
  const [pendingReview, setPendingReview] = useState<{
    label: string;
    newFiles: FileSystem;
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

  // Save WIP to IndexedDB when files change
  useEffect(() => {
    if (!project.currentProject || !hasInitializedFromBackend.current) return;
    // Capture project id before setTimeout callback to satisfy TypeScript null check
    const currentProjectId = project.currentProject.id;
    if (Object.keys(files).length === 0) return;

    const currentFilesJson = JSON.stringify(files);
    const hasChanges = lastCommittedFilesRef.current !== '' &&
                       currentFilesJson !== lastCommittedFilesRef.current;
    setHasUncommittedChanges(hasChanges);

    const timeout = setTimeout(() => {
      saveWIPData({
        id: currentProjectId,
        files,
        activeFile,
        activeTab,
        savedAt: Date.now()
      });
    }, 1000);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only track project id, not full currentProject object
  }, [files, activeFile, activeTab, project.currentProject?.id]);

  // Review change handler
  const reviewChange = useCallback((label: string, newFiles: FileSystem) => {
    if (autoAcceptChanges) {
      setFiles(newFiles);
      if (!newFiles[activeFile]) {
        const firstSrc = Object.keys(newFiles).find(f => f.startsWith('src/'));
        setActiveFile(firstSrc || 'package.json');
      }
    } else {
      setPendingReview({ label, newFiles });
    }
  }, [autoAcceptChanges, activeFile, setFiles]);

  const confirmChange = useCallback(() => {
    if (pendingReview) {
      setFiles(pendingReview.newFiles);
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
  const createProject = useCallback(async (name: string, description?: string) => {
    return await project.createProject(name, description, files);
  }, [project, files]);

  const openProject = useCallback(async (id: string) => {
    if (isSwitchingProjectRef.current) {
      console.log('[AppContext] Project switch in progress, ignoring');
      return { success: false, files: {} };
    }
    isSwitchingProjectRef.current = true;

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
  }, [project, activeFile, activeTab, exportHistory, restoreHistory, resetFiles]);

  // Reset app
  const resetApp = useCallback(() => {
    resetFiles(defaultFiles);
    setActiveFile('src/App.tsx');
    setSuggestions(null);
    setIsGenerating(false);
  }, [defaultFiles, resetFiles]);

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

    // UI state
    activeTab,
    setActiveTab,
    isGenerating,
    setIsGenerating,
    suggestions,
    setSuggestions,
    selectedModel,
    setSelectedModel,
    autoAcceptChanges,
    setAutoAcceptChanges,
    diffModeEnabled,
    setDiffModeEnabled,

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
    activeTab, isGenerating, suggestions, selectedModel, autoAcceptChanges, diffModeEnabled,
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

// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useUIState() {
  const ctx = useAppContext();
  return {
    activeTab: ctx.activeTab,
    setActiveTab: ctx.setActiveTab,
    isGenerating: ctx.isGenerating,
    setIsGenerating: ctx.setIsGenerating,
    suggestions: ctx.suggestions,
    setSuggestions: ctx.setSuggestions,
    selectedModel: ctx.selectedModel,
    setSelectedModel: ctx.setSelectedModel,
    autoAcceptChanges: ctx.autoAcceptChanges,
    setAutoAcceptChanges: ctx.setAutoAcceptChanges,
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
