/**
 * Lazy Modal Utilities
 *
 * Preload functions and hooks for lazy-loaded modals.
 * Separated from LazyModals.tsx to avoid react-refresh warnings.
 */

import { useEffect } from 'react';

/**
 * Preload a modal component (useful for prefetching on hover)
 */
export const preloadModal = {
  aiSettings: () => import('./AISettingsModal'),
  megaSettings: () => import('./MegaSettingsModal'),
  aiHistory: () => import('./AIHistoryModal'),
  codeMap: () => import('./ControlPanel/CodeMapModal'),
  tailwindPalette: () => import('./TailwindPalette'),
  componentTree: () => import('./ComponentTree'),
  credits: () => import('./CreditsModal'),
  codebaseSync: () => import('./CodebaseSyncModal'),
};

/**
 * Hook to preload modals on idle
 * Call this in App.tsx to preload modals after initial render
 */
export function usePreloadModals() {
  useEffect(() => {
    // Wait for idle time before preloading
    const idleCallback = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1000));

    idleCallback(() => {
      // Preload the most commonly used modals
      preloadModal.aiSettings();
      preloadModal.megaSettings();
    });
  }, []);
}
