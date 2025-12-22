/**
 * Context Menu System
 *
 * Reusable right-click context menu for the entire application
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Copy, Trash2, RotateCcw, Download, Code, Image } from 'lucide-react';

export type ContextMenuType = 'chat' | 'file' | 'code' | 'image' | 'default';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

export interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  type: ContextMenuType;
  contextData?: unknown;
}

interface ContextMenuContextValue {
  state: ContextMenuState;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[], type?: ContextMenuType, contextData?: unknown) => void;
  hideContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

interface ContextMenuProviderProps {
  children: ReactNode;
}

export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
  const [state, setState] = useState<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    items: [],
    type: 'default',
  });

  const showContextMenu = useCallback((
    x: number,
    y: number,
    items: ContextMenuItem[],
    type: ContextMenuType = 'default',
    contextData?: unknown
  ) => {
    setState({ show: true, x, y, items, type, contextData });
  }, []);

  const hideContextMenu = useCallback(() => {
    setState(prev => ({ ...prev, show: false }));
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = () => {
      if (state.show) {
        hideContextMenu();
      }
    };

    if (state.show) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [state.show, hideContextMenu]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.show) {
        hideContextMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state.show, hideContextMenu]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (!item.disabled) {
      item.action();
      hideContextMenu();
    }
  };

  // Adjust position if menu would go off screen
  const adjustedPosition = useCallback(() => {
    const menuWidth = 200;
    const menuHeight = state.items.length * 36 + 8; // Approximate

    let x = state.x;
    let y = state.y;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }

    return { x, y };
  }, [state.x, state.y, state.items.length]);

  const value: ContextMenuContextValue = {
    state,
    showContextMenu,
    hideContextMenu,
  };

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {state.show && (
        <div
          className="fixed z-[99999] pointer-events-none"
          style={{ left: 0, top: 0, width: '100vw', height: '100vh' }}
        >
          <div
            className="absolute bg-slate-800 border border-white/10 rounded-lg shadow-2xl overflow-hidden min-w-[180px] py-1"
            style={{
              left: adjustedPosition().x,
              top: adjustedPosition().y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {state.items.map((item, _index) => (
              <React.Fragment key={item.id}>
                {item.separator && <div className="my-1 border-t border-white/10" />}
                <button
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  className={`w-full px-3 py-2 flex items-center gap-2 text-sm transition-colors pointer-events-auto ${
                    item.danger
                      ? 'text-red-400 hover:bg-red-500/10'
                      : 'text-slate-300 hover:bg-white/5'
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={item.shortcut}
                >
                  {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-xs text-slate-500">{item.shortcut}</span>
                  )}
                </button>
              </React.Fragment>
            ))}

            {state.items.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-500">No actions</div>
            )}
          </div>
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}

/**
 * Helper to create common menu items
 */
export const MenuItems = {
  copy: (text: string, label: string = 'Copy'): ContextMenuItem => ({
    id: 'copy',
    label,
    icon: <Copy className="w-4 h-4" />,
    action: () => {
      navigator.clipboard.writeText(text);
    },
  }),

  copyMessage: (message: string, onCopy?: () => void): ContextMenuItem => ({
    id: 'copy-message',
    label: 'Copy Message',
    icon: <Copy className="w-4 h-4" />,
    action: () => {
      navigator.clipboard.writeText(message);
      onCopy?.();
    },
    shortcut: 'Ctrl+C',
  }),

  regenerate: (onRegenerate: () => void): ContextMenuItem => ({
    id: 'regenerate',
    label: 'Regenerate',
    icon: <RotateCcw className="w-4 h-4" />,
    action: onRegenerate,
    shortcut: 'Ctrl+R',
  }),

  delete: (onDelete: () => void, label: string = 'Delete'): ContextMenuItem => ({
    id: 'delete',
    label,
    icon: <Trash2 className="w-4 h-4" />,
    action: onDelete,
    danger: true,
    shortcut: 'Del',
  }),

  download: (content: string, filename: string): ContextMenuItem => ({
    id: 'download',
    label: 'Download',
    icon: <Download className="w-4 h-4" />,
    action: () => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  }),

  // File-specific items
  renameFile: (onRename: () => void): ContextMenuItem => ({
    id: 'rename-file',
    label: 'Rename',
    action: onRename,
    shortcut: 'F2',
  }),

  deleteFile: (filePath: string, onDelete: (path: string) => void): ContextMenuItem => ({
    id: 'delete-file',
    label: 'Delete File',
    icon: <Trash2 className="w-4 h-4" />,
    action: () => onDelete(filePath),
    danger: true,
  }),

  // Code-specific items
  formatCode: (onFormat: () => void): ContextMenuItem => ({
    id: 'format-code',
    label: 'Format Code',
    icon: <Code className="w-4 h-4" />,
    action: onFormat,
    shortcut: 'Shift+Alt+F',
  }),

  insertSnippet: (onInsert: () => void): ContextMenuItem => ({
    id: 'insert-snippet',
    label: 'Insert Snippet',
    action: onInsert,
    shortcut: 'Ctrl+Space',
  }),

  // Image-specific items
  copyImage: (imageUrl: string): ContextMenuItem => ({
    id: 'copy-image',
    label: 'Copy Image',
    icon: <Image className="w-4 h-4" />,
    action: async () => {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      } catch (err) {
        console.error('Failed to copy image:', err);
      }
    },
  }),

  downloadImage: (imageUrl: string, filename: string = 'image.png'): ContextMenuItem => ({
    id: 'download-image',
    label: 'Download Image',
    icon: <Download className="w-4 h-4" />,
    action: () => {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  }),

  separator: (): ContextMenuItem => ({
    id: `separator-${Date.now()}`,
    label: '',
    action: () => {},
    separator: true,
  }),
};

/**
 * Hook to add context menu to chat messages
 */
export function useChatContextMenu(messageId: string, messageContent: string, onRegenerate?: () => void, onDelete?: () => void) {
  const { showContextMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      MenuItems.copyMessage(messageContent),
    ];

    if (onRegenerate) {
      items.push(MenuItems.regenerate(onRegenerate));
    }

    items.push(MenuItems.separator());

    if (onDelete) {
      items.push(MenuItems.delete(onDelete, 'Delete Message'));
    }

    showContextMenu(e.clientX, e.clientY, items, 'chat', { messageId });
  };

  return handleContextMenu;
}

/**
 * Hook to add context menu to file list items
 */
export function useFileContextMenu(
  filePath: string,
  fileContent: string,
  onDelete: (path: string) => void,
  onRename?: (oldPath: string, newPath: string) => void,
  onRequestRenameDialog?: (filePath: string, currentName: string) => void
) {
  const { showContextMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      MenuItems.copy(fileContent, 'Copy File Content'),
      MenuItems.download(fileContent, filePath.split('/').pop() || 'file.txt'),
    ];

    if (onRename || onRequestRenameDialog) {
      items.push({
        id: 'rename-file',
        label: 'Rename',
        action: () => {
          if (onRequestRenameDialog) {
            // Use the dialog-based rename (preferred)
            onRequestRenameDialog(filePath, filePath.split('/').pop() || '');
          } else if (onRename) {
            // Fallback: execute rename with empty new path (caller must handle dialog)
            // This maintains compatibility but requires caller to implement rename UI
            onRename(filePath, '');
          }
        },
        shortcut: 'F2',
      });
    }

    items.push(MenuItems.separator(), MenuItems.deleteFile(filePath, onDelete));

    showContextMenu(e.clientX, e.clientY, items, 'file', { filePath });
  };

  return handleContextMenu;
}

/**
 * Hook to add context menu to code editor
 */
export function useCodeContextMenu(code: string, onFormat?: () => void, onInsertSnippet?: () => void) {
  const { showContextMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      MenuItems.copy(code, 'Copy Code'),
    ];

    if (onFormat) {
      items.push(MenuItems.formatCode(onFormat));
    }

    if (onInsertSnippet) {
      items.push(MenuItems.insertSnippet(onInsertSnippet));
    }

    showContextMenu(e.clientX, e.clientY, items, 'code');
  };

  return handleContextMenu;
}

export default ContextMenuProvider;
