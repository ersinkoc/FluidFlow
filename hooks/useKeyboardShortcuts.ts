import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description: string;
  category?: string;
}

// Default shortcuts configuration
export const DEFAULT_SHORTCUTS: Omit<KeyboardShortcut, 'action'>[] = [
  { key: 'p', ctrl: true, description: 'Open Command Palette', category: 'General' },
  { key: 'k', ctrl: true, description: 'Open Command Palette', category: 'General' },
  { key: 's', ctrl: true, description: 'Save current file', category: 'Editor' },
  { key: 'z', ctrl: true, description: 'Undo', category: 'Editor' },
  { key: 'z', ctrl: true, shift: true, description: 'Redo', category: 'Editor' },
  { key: 'y', ctrl: true, description: 'Redo', category: 'Editor' },
  { key: 'f', ctrl: true, description: 'Find in file', category: 'Editor' },
  { key: 'f', ctrl: true, shift: true, description: 'Find in all files', category: 'Search' },
  { key: 'b', ctrl: true, description: 'Toggle sidebar', category: 'View' },
  { key: '1', ctrl: true, description: 'Switch to Preview tab', category: 'Tabs' },
  { key: '2', ctrl: true, description: 'Switch to Code tab', category: 'Tabs' },
  { key: 'Enter', ctrl: true, description: 'Run/Generate', category: 'General' },
  { key: '/', ctrl: true, description: 'Toggle comment', category: 'Editor' },
  { key: 'Escape', description: 'Close modal/panel', category: 'General' },
];

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if user is typing in an input/textarea (unless it's a global shortcut)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = !shortcut.ctrl || (event.ctrlKey || event.metaKey);
      const shiftMatch = !shortcut.shift || event.shiftKey;
      const altMatch = !shortcut.alt || event.altKey;

      // For shortcuts with modifiers, allow them even in inputs
      const hasModifier = shortcut.ctrl || shortcut.shift || shortcut.alt || shortcut.meta;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        if (!isInput || hasModifier) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Format shortcut for display
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'action'>): string {
  const parts: string[] = [];

  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.meta) parts.push('⌘');

  // Format special keys
  let key = shortcut.key;
  if (key === ' ') key = 'Space';
  if (key === 'ArrowUp') key = '↑';
  if (key === 'ArrowDown') key = '↓';
  if (key === 'ArrowLeft') key = '←';
  if (key === 'ArrowRight') key = '→';
  if (key === 'Enter') key = '↵';
  if (key === 'Escape') key = 'Esc';

  parts.push(key.toUpperCase());

  return parts.join('+');
}
