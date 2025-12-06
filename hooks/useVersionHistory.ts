import { useState, useCallback, useRef } from 'react';
import { FileSystem } from '../types';

interface VersionHistoryState {
  past: FileSystem[];
  present: FileSystem;
  future: FileSystem[];
}

interface UseVersionHistoryReturn {
  files: FileSystem;
  setFiles: (newFiles: FileSystem | ((prev: FileSystem) => FileSystem)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initialFiles: FileSystem) => void;
  historyLength: number;
  currentIndex: number;
}

const MAX_HISTORY_SIZE = 50;

export function useVersionHistory(initialFiles: FileSystem): UseVersionHistoryReturn {
  const [state, setState] = useState<VersionHistoryState>({
    past: [],
    present: initialFiles,
    future: [],
  });

  // Debounce timer for batching rapid changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFilesRef = useRef<FileSystem | null>(null);

  // Commit pending changes to history
  const commitPendingChanges = useCallback(() => {
    if (pendingFilesRef.current) {
      const pendingFiles = pendingFilesRef.current;
      pendingFilesRef.current = null;

      setState(prevState => {
        // Don't add to history if nothing changed
        if (JSON.stringify(prevState.present) === JSON.stringify(pendingFiles)) {
          return prevState;
        }

        const newPast = [...prevState.past, prevState.present];
        // Limit history size
        if (newPast.length > MAX_HISTORY_SIZE) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: pendingFiles,
          future: [], // Clear future on new change
        };
      });
    }
  }, []);

  // Set files with debounced history
  const setFiles = useCallback((newFilesOrUpdater: FileSystem | ((prev: FileSystem) => FileSystem)) => {
    setState(prevState => {
      const newFiles = typeof newFilesOrUpdater === 'function'
        ? newFilesOrUpdater(prevState.present)
        : newFilesOrUpdater;

      // Store pending changes
      pendingFilesRef.current = newFiles;

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
        present: newFiles,
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
      const newPresent = newPast.pop()!;

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
      const newPresent = newFuture.shift()!;

      return {
        past: [...prevState.past, prevState.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  // Reset to new initial state
  const reset = useCallback((initialFiles: FileSystem) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingFilesRef.current = null;

    setState({
      past: [],
      present: initialFiles,
      future: [],
    });
  }, []);

  return {
    files: state.present,
    setFiles,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    historyLength: state.past.length + 1 + state.future.length,
    currentIndex: state.past.length,
  };
}
