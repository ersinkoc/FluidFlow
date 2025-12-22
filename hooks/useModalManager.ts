/**
 * useModalManager Hook
 *
 * Centralized modal state management for the application.
 * Replaces 15+ individual useState calls in App.tsx with a single hook.
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * All modal types in the application
 */
export type ModalType =
  | 'snippetsPanel'
  | 'tailwindPalette'
  | 'componentTree'
  | 'deploy'
  | 'share'
  | 'aiSettings'
  | 'megaSettings'
  | 'history'
  | 'projectManager'
  | 'credits'
  | 'codeMap'
  | 'diff';

/**
 * Modal state record
 */
export type ModalState = Record<ModalType, boolean>;

/**
 * Initial modal state - all closed
 */
const INITIAL_STATE: ModalState = {
  snippetsPanel: false,
  tailwindPalette: false,
  componentTree: false,
  deploy: false,
  share: false,
  aiSettings: false,
  megaSettings: false,
  history: false,
  projectManager: false,
  credits: false,
  codeMap: false,
  diff: false,
};

/**
 * Modal manager return type
 */
export interface ModalManager {
  /** Current modal state */
  state: ModalState;
  /** Check if a specific modal is open */
  isOpen: (modal: ModalType) => boolean;
  /** Open a modal */
  open: (modal: ModalType) => void;
  /** Close a modal */
  close: (modal: ModalType) => void;
  /** Toggle a modal */
  toggle: (modal: ModalType) => void;
  /** Close all modals */
  closeAll: () => void;
  /** Check if any modal is open */
  hasOpenModal: boolean;
  /** Individual setters for backwards compatibility */
  setters: Record<ModalType, (isOpen: boolean) => void>;
}

/**
 * Hook for managing all modal states in the application
 *
 * @example
 * ```tsx
 * const modals = useModalManager();
 *
 * // Open a modal
 * modals.open('aiSettings');
 *
 * // Check if open
 * if (modals.isOpen('aiSettings')) { ... }
 *
 * // Use in component
 * <AISettingsModal isOpen={modals.state.aiSettings} onClose={() => modals.close('aiSettings')} />
 * ```
 */
export function useModalManager(): ModalManager {
  const [state, setState] = useState<ModalState>(INITIAL_STATE);

  const isOpen = useCallback((modal: ModalType) => state[modal], [state]);

  const open = useCallback((modal: ModalType) => {
    setState(prev => ({ ...prev, [modal]: true }));
  }, []);

  const close = useCallback((modal: ModalType) => {
    setState(prev => ({ ...prev, [modal]: false }));
  }, []);

  const toggle = useCallback((modal: ModalType) => {
    setState(prev => ({ ...prev, [modal]: !prev[modal] }));
  }, []);

  const closeAll = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const hasOpenModal = useMemo(
    () => Object.values(state).some(Boolean),
    [state]
  );

  // Create individual setters for backwards compatibility
  const setters = useMemo(() => {
    const result = {} as Record<ModalType, (isOpen: boolean) => void>;
    const modalTypes: ModalType[] = [
      'snippetsPanel',
      'tailwindPalette',
      'componentTree',
      'deploy',
      'share',
      'aiSettings',
      'megaSettings',
      'history',
      'projectManager',
      'credits',
      'codeMap',
      'diff',
    ];

    for (const modal of modalTypes) {
      result[modal] = (isOpen: boolean) => {
        setState(prev => ({ ...prev, [modal]: isOpen }));
      };
    }

    return result;
  }, []);

  return {
    state,
    isOpen,
    open,
    close,
    toggle,
    closeAll,
    hasOpenModal,
    setters,
  };
}

/**
 * Helper to create modal props for a component
 *
 * @example
 * ```tsx
 * const modals = useModalManager();
 * const aiSettingsProps = createModalProps(modals, 'aiSettings');
 * <AISettingsModal {...aiSettingsProps} />
 * ```
 */
export function createModalProps(manager: ModalManager, modal: ModalType) {
  return {
    isOpen: manager.state[modal],
    onClose: () => manager.close(modal),
  };
}

/**
 * Mapping from old state names to new modal types (for migration)
 */
export const LEGACY_STATE_MAPPING: Record<string, ModalType> = {
  isSnippetsPanelOpen: 'snippetsPanel',
  isTailwindPaletteOpen: 'tailwindPalette',
  isComponentTreeOpen: 'componentTree',
  isDeployModalOpen: 'deploy',
  isShareModalOpen: 'share',
  isAISettingsOpen: 'aiSettings',
  isMegaSettingsOpen: 'megaSettings',
  isHistoryPanelOpen: 'history',
  isProjectManagerOpen: 'projectManager',
  isCreditsModalOpen: 'credits',
  isCodeMapModalOpen: 'codeMap',
};
