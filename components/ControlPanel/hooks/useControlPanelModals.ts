/**
 * useControlPanelModals - Centralized modal state management for ControlPanel
 *
 * Handles:
 * - Modal exclusivity (only one modal open at a time for settings/projects/techstack)
 * - Individual modal states (reset, AI history, codebase sync)
 * - Batch generation modal with payload
 */

import { useState, useCallback } from 'react';

export type ExclusiveModalType = 'settings' | 'projects' | 'techstack' | 'promptengineer' | 'batchgen' | null;

interface BatchGenModalState {
  isOpen: boolean;
  prompt: string;
  systemInstruction: string;
  targetFiles: string[];
}

export function useControlPanelModals() {
  // Modal exclusivity state (only one of these can be open at a time)
  const [openModal, setOpenModal] = useState<ExclusiveModalType>(null);

  // Individual modal states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);
  const [showCodebaseSync, setShowCodebaseSync] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);

  // Batch generation modal state (with payload)
  const [batchGenModal, setBatchGenModal] = useState<BatchGenModalState | null>(null);

  // Modal exclusivity handlers
  const openExclusiveModal = useCallback((modalType: ExclusiveModalType) => {
    setOpenModal(modalType);
  }, []);

  const closeExclusiveModal = useCallback((modalType: ExclusiveModalType) => {
    setOpenModal(prev => prev === modalType ? null : prev);
  }, []);

  // Convenience handlers for specific modals
  const openSettings = useCallback(() => openExclusiveModal('settings'), [openExclusiveModal]);
  const closeSettings = useCallback(() => closeExclusiveModal('settings'), [closeExclusiveModal]);

  const openProjects = useCallback(() => openExclusiveModal('projects'), [openExclusiveModal]);
  const closeProjects = useCallback(() => closeExclusiveModal('projects'), [closeExclusiveModal]);

  const openTechStack = useCallback(() => openExclusiveModal('techstack'), [openExclusiveModal]);
  const closeTechStack = useCallback(() => closeExclusiveModal('techstack'), [closeExclusiveModal]);

  const openPromptEngineer = useCallback(() => openExclusiveModal('promptengineer'), [openExclusiveModal]);
  const closePromptEngineer = useCallback(() => closeExclusiveModal('promptengineer'), [closeExclusiveModal]);

  // Batch generation modal
  const openBatchGen = useCallback((prompt: string, systemInstruction: string, targetFiles: string[]) => {
    setBatchGenModal({
      isOpen: true,
      prompt,
      systemInstruction,
      targetFiles,
    });
  }, []);

  const closeBatchGen = useCallback(() => {
    setBatchGenModal(null);
  }, []);

  // Individual modal handlers
  const openResetConfirm = useCallback(() => setShowResetConfirm(true), []);
  const closeResetConfirm = useCallback(() => setShowResetConfirm(false), []);

  const openAIHistory = useCallback(() => setShowAIHistory(true), []);
  const closeAIHistory = useCallback(() => setShowAIHistory(false), []);

  const openCodebaseSync = useCallback(() => setShowCodebaseSync(true), []);
  const closeCodebaseSync = useCallback(() => setShowCodebaseSync(false), []);

  const openPromptHistory = useCallback(() => setShowPromptHistory(true), []);
  const closePromptHistory = useCallback(() => setShowPromptHistory(false), []);

  return {
    // Exclusive modal state
    openModal,
    openExclusiveModal,
    closeExclusiveModal,

    // Settings modal
    isSettingsOpen: openModal === 'settings',
    openSettings,
    closeSettings,
    shouldCloseSettings: openModal === 'projects' || openModal === 'techstack',

    // Projects modal
    isProjectsOpen: openModal === 'projects',
    openProjects,
    closeProjects,
    shouldCloseProjects: openModal === 'settings',

    // Tech stack modal
    isTechStackOpen: openModal === 'techstack',
    openTechStack,
    closeTechStack,

    // Prompt engineer modal
    isPromptEngineerOpen: openModal === 'promptengineer',
    openPromptEngineer,
    closePromptEngineer,

    // Batch generation modal
    batchGenModal,
    openBatchGen,
    closeBatchGen,

    // Reset confirmation
    showResetConfirm,
    openResetConfirm,
    closeResetConfirm,

    // AI History
    showAIHistory,
    openAIHistory,
    closeAIHistory,

    // Codebase sync
    showCodebaseSync,
    openCodebaseSync,
    closeCodebaseSync,

    // Prompt history
    showPromptHistory,
    openPromptHistory,
    closePromptHistory,
  };
}
