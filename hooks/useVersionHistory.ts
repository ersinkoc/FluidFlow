import { useState, useCallback, useRef, useEffect } from 'react';
import { FileSystem } from '../types';

// History entry with metadata
export interface HistoryEntry {
  files: FileSystem;
  label: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'snapshot';
  changedFiles?: string[];
}

interface VersionHistoryState {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
}

// Options for setFiles
export interface SetFilesOptions {
  label?: string;
  skipHistory?: boolean;  // Skip creating history entry (for revert/time travel)
}

export interface UseVersionHistoryReturn {
  files: FileSystem;
  setFiles: (newFiles: FileSystem | ((prev: FileSystem) => FileSystem), options?: string | SetFilesOptions) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initialFiles: FileSystem) => void;
  historyLength: number;
  currentIndex: number;
  // New features
  history: HistoryEntry[];
  goToIndex: (index: number) => void;
  saveSnapshot: (name: string) => void;
  getChangedFiles: (index: number) => string[];
  currentEntry: HistoryEntry;
  // Export/restore for backend persistence
  exportHistory: () => { history: HistoryEntry[]; currentIndex: number };
  restoreHistory: (history: HistoryEntry[], currentIndex: number) => void;
}

const MAX_HISTORY_SIZE = 50;

// Calculate changed files between two file systems
function calculateChangedFiles(oldFiles: FileSystem, newFiles: FileSystem): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  allKeys.forEach(key => {
    if (oldFiles[key] !== newFiles[key]) {
      changed.push(key);
    }
  });

  return changed;
}

export function useVersionHistory(initialFiles: FileSystem): UseVersionHistoryReturn {
  const initialEntry: HistoryEntry = {
    files: initialFiles,
    label: 'Initial State',
    timestamp: Date.now(),
    type: 'auto',
    changedFiles: Object.keys(initialFiles)
  };

  const [state, setState] = useState<VersionHistoryState>({
    past: [],
    present: initialEntry,
    future: [],
  });

  // Debounce timer for batching rapid changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFilesRef = useRef<{ files: FileSystem; label?: string } | null>(null);
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Cleanup on unmount - commit any pending changes
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear the debounce timer to prevent memory leaks
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Note: We intentionally don't commit pending changes on unmount
      // because setState won't work after unmount. Callers should use
      // exportHistory() before unmounting if they need to persist changes.
    };
  }, []);

  // Commit pending changes to history
  const commitPendingChanges = useCallback(() => {
    // Don't commit if unmounted - prevents React state update warnings
    if (!isMountedRef.current) return;

    if (pendingFilesRef.current) {
      const { files: pendingFiles, label } = pendingFilesRef.current;
      pendingFilesRef.current = null;

      setState(prevState => {
        // Don't add to history if nothing changed
        if (JSON.stringify(prevState.present.files) === JSON.stringify(pendingFiles)) {
          return prevState;
        }

        const changedFiles = calculateChangedFiles(prevState.present.files, pendingFiles);
        const autoLabel = changedFiles.length > 0
          ? `Modified ${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''}`
          : 'Changes';

        const newEntry: HistoryEntry = {
          files: pendingFiles,
          label: label || autoLabel,
          timestamp: Date.now(),
          type: label ? 'manual' : 'auto',
          changedFiles
        };

        const newPast = [...prevState.past, prevState.present];
        // Limit history size
        if (newPast.length > MAX_HISTORY_SIZE) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: newEntry,
          future: [], // Clear future on new change
        };
      });
    }
  }, []);

  // Set files with debounced history
  const setFiles = useCallback((
    newFilesOrUpdater: FileSystem | ((prev: FileSystem) => FileSystem),
    options?: string | SetFilesOptions
  ) => {
    // Parse options - support both string (label) and object
    const opts: SetFilesOptions = typeof options === 'string'
      ? { label: options }
      : (options || {});

    setState(prevState => {
      const newFiles = typeof newFilesOrUpdater === 'function'
        ? newFilesOrUpdater(prevState.present.files)
        : newFilesOrUpdater;

      // If skipHistory is true, just update present without touching history
      if (opts.skipHistory) {
        // Clear any pending changes to prevent them from being committed
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        pendingFilesRef.current = null;

        return {
          ...prevState,
          present: {
            ...prevState.present,
            files: newFiles,
          },
        };
      }

      // Store pending changes with label
      pendingFilesRef.current = { files: newFiles, label: opts.label };

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer to commit changes
      debounceTimerRef.current = setTimeout(() => {
        commitPendingChanges();
      }, 500); // 500ms debounce

      // Immediately update present for UI responsiveness
      return {
        ...prevState,
        present: {
          ...prevState.present,
          files: newFiles,
        },
      };
    });
  }, [commitPendingChanges]);

  // Undo
  const undo = useCallback(() => {
    // Commit any pending changes first
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingFilesRef.current) {
      pendingFilesRef.current = null;
    }

    setState(prevState => {
      if (prevState.past.length === 0) return prevState;

      const newPast = [...prevState.past];
      // Safe: We checked past.length > 0 above, so pop() will always return a value
      const newPresent = newPast.pop() as HistoryEntry;

      return {
        past: newPast,
        present: newPresent,
        future: [prevState.present, ...prevState.future],
      };
    });
  }, []);

  // Redo
  const redo = useCallback(() => {
    setState(prevState => {
      if (prevState.future.length === 0) return prevState;

      const newFuture = [...prevState.future];
      // Safe: We checked future.length > 0 above, so shift() will always return a value
      const newPresent = newFuture.shift() as HistoryEntry;

      return {
        past: [...prevState.past, prevState.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  // Go to specific index in history
  const goToIndex = useCallback((targetIndex: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFilesRef.current = null;

    setState(prevState => {
      const allHistory = [...prevState.past, prevState.present, ...prevState.future];
      const currentIdx = prevState.past.length;

      if (targetIndex < 0 || targetIndex >= allHistory.length || targetIndex === currentIdx) {
        return prevState;
      }

      return {
        past: allHistory.slice(0, targetIndex),
        present: allHistory[targetIndex],
        future: allHistory.slice(targetIndex + 1),
      };
    });
  }, []);

  // Save named snapshot
  const saveSnapshot = useCallback((name: string) => {
    // Commit any pending changes first
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      commitPendingChanges();
    }

    setState(prevState => {
      const snapshotEntry: HistoryEntry = {
        files: { ...prevState.present.files },
        label: `📌 ${name}`,
        timestamp: Date.now(),
        type: 'snapshot',
        changedFiles: []
      };

      const newPast = [...prevState.past, prevState.present];
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift();
      }

      return {
        past: newPast,
        present: snapshotEntry,
        future: [],
      };
    });
  }, [commitPendingChanges]);

  // Get changed files for a specific index
  const getChangedFiles = useCallback((index: number): string[] => {
    const allHistory = [...state.past, state.present, ...state.future];
    if (index < 0 || index >= allHistory.length) return [];
    return allHistory[index].changedFiles || [];
  }, [state]);

  // Reset to new initial state
  const reset = useCallback((initialFiles: FileSystem) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFilesRef.current = null;

    setState({
      past: [],
      present: {
        files: initialFiles,
        label: 'Initial State',
        timestamp: Date.now(),
        type: 'auto',
        changedFiles: Object.keys(initialFiles)
      },
      future: [],
    });
  }, []);

  // Export full history for backend persistence
  const exportHistory = useCallback(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // If there are pending changes, construct export data including them
    // (without relying on async setState which would cause race condition)
    if (pendingFilesRef.current) {
      const { files: pendingFiles, label } = pendingFilesRef.current;
      pendingFilesRef.current = null;

      // Check if changes are meaningful
      if (JSON.stringify(state.present.files) !== JSON.stringify(pendingFiles)) {
        const changedFiles = calculateChangedFiles(state.present.files, pendingFiles);
        const autoLabel = changedFiles.length > 0
          ? `Modified ${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''}`
          : 'Changes';

        const newEntry: HistoryEntry = {
          files: pendingFiles,
          label: label || autoLabel,
          timestamp: Date.now(),
          type: label ? 'manual' : 'auto',
          changedFiles
        };

        // Construct history with pending changes included
        const newPast = [...state.past, state.present];
        if (newPast.length > MAX_HISTORY_SIZE) {
          newPast.shift();
        }

        return {
          history: [...newPast, newEntry],
          currentIndex: newPast.length
        };
      }
    }

    // No pending changes - return current state
    const allHistory = [...state.past, state.present, ...state.future];
    return {
      history: allHistory,
      currentIndex: state.past.length
    };
  }, [state]);

  // Restore history from backend
  const restoreHistory = useCallback((history: HistoryEntry[], currentIndex: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFilesRef.current = null;

    if (!history || history.length === 0) {
      return;
    }

    // Ensure currentIndex is valid
    const validIndex = Math.max(0, Math.min(currentIndex, history.length - 1));

    setState({
      past: history.slice(0, validIndex),
      present: history[validIndex],
      future: history.slice(validIndex + 1),
    });

    console.log('[VersionHistory] Restored', history.length, 'entries, current index:', validIndex);
  }, []);

  // Build full history array for UI
  const history: HistoryEntry[] = [...state.past, state.present, ...state.future];

  return {
    files: state.present.files,
    setFiles,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    historyLength: history.length,
    currentIndex: state.past.length,
    // New features
    history,
    goToIndex,
    saveSnapshot,
    getChangedFiles,
    currentEntry: state.present,
    // Export/restore for backend persistence
    exportHistory,
    restoreHistory,
  };
}
