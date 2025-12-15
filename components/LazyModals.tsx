/**
 * Lazy Modal Loading
 *
 * Provides lazy-loaded versions of heavy modals to reduce initial bundle size.
 * Modals are loaded on-demand when first opened.
 *
 * Bundle size savings: ~80KB from initial load
 */

import React, { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy imports for heavy modals
const AISettingsModalLazy = lazy(() => import('./AISettingsModal').then(m => ({ default: m.AISettingsModal })));
const MegaSettingsModalLazy = lazy(() => import('./MegaSettingsModal').then(m => ({ default: m.MegaSettingsModal })));
const AIHistoryModalLazy = lazy(() => import('./AIHistoryModal').then(m => ({ default: m.AIHistoryModal })));
const CodeMapModalLazy = lazy(() => import('./ControlPanel/CodeMapModal').then(m => ({ default: m.CodeMapModal })));
const TailwindPaletteLazy = lazy(() => import('./TailwindPalette').then(m => ({ default: m.TailwindPalette })));
const ComponentTreeLazy = lazy(() => import('./ComponentTree').then(m => ({ default: m.ComponentTree })));
const CreditsModalLazy = lazy(() => import('./CreditsModal').then(m => ({ default: m.CreditsModal })));
const CodebaseSyncModalLazy = lazy(() => import('./CodebaseSyncModal').then(m => ({ default: m.CodebaseSyncModal })));

/**
 * Modal loading spinner
 */
function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 p-6 bg-slate-900 border border-white/10 rounded-xl">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="text-sm text-slate-400">Loading...</span>
      </div>
    </div>
  );
}

/**
 * HOC to wrap a lazy component with Suspense and conditional rendering
 */
function withLazyModal<P extends { isOpen: boolean }>(
  LazyComponent: ComponentType<P>,
  displayName: string
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => {
    // Don't render anything if not open - prevents unnecessary loading
    if (!props.isOpen) return null;

    return (
      <Suspense fallback={<ModalLoadingFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  WrappedComponent.displayName = `Lazy${displayName}`;
  return WrappedComponent;
}

// Export lazy versions
export const LazyAISettingsModal = withLazyModal(AISettingsModalLazy, 'AISettingsModal');
export const LazyMegaSettingsModal = withLazyModal(MegaSettingsModalLazy, 'MegaSettingsModal');
export const LazyAIHistoryModal = withLazyModal(AIHistoryModalLazy, 'AIHistoryModal');
export const LazyCodeMapModal = withLazyModal(CodeMapModalLazy, 'CodeMapModal');
export const LazyTailwindPalette = withLazyModal(TailwindPaletteLazy, 'TailwindPalette');
export const LazyComponentTree = withLazyModal(ComponentTreeLazy, 'ComponentTree');
export const LazyCreditsModal = withLazyModal(CreditsModalLazy, 'CreditsModal');
export const LazyCodebaseSyncModal = withLazyModal(CodebaseSyncModalLazy, 'CodebaseSyncModal');

// Preload utilities moved to ./lazyModalUtils.ts to avoid react-refresh warnings
