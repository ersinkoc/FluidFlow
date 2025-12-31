/**
 * InspectorPanel - CSS Inspector Side Panel
 *
 * Chrome DevTools-like panel for inspecting:
 * - Computed CSS styles
 * - Box model visualization
 * - Component props/state
 * - Quick style presets with AI
 */

import React, { memo } from 'react';
import { X, Palette, Box, Code2, Wand2, MousePointer2, Sparkles } from 'lucide-react';
import { StylesTab } from './StylesTab';
import { BoxModelTab } from './BoxModelTab';
import { PropsTab } from './PropsTab';
import { QuickStylesTab } from './QuickStylesTab';
import type { InspectorPanelProps, InspectorTabConfig } from './types';

const TABS: InspectorTabConfig[] = [
  { id: 'styles', label: 'Styles', icon: 'Palette', description: 'CSS Properties' },
  { id: 'boxmodel', label: 'Box', icon: 'Box', description: 'Dimensions' },
  { id: 'props', label: 'Props', icon: 'Code2', description: 'React Props' },
  { id: 'quickstyles', label: 'AI', icon: 'Wand2', description: 'AI Styles' },
];

const TabIcon: React.FC<{ icon: string; className?: string }> = ({ icon, className }) => {
  switch (icon) {
    case 'Palette':
      return <Palette className={className} />;
    case 'Box':
      return <Box className={className} />;
    case 'Code2':
      return <Code2 className={className} />;
    case 'Wand2':
      return <Wand2 className={className} />;
    default:
      return null;
  }
};

export const InspectorPanel = memo(function InspectorPanel({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  // Styles tab
  computedStyles,
  tailwindClasses,
  isStylesLoading,
  // Props tab
  componentProps,
  componentState,
  componentName,
  isPropsLoading,
  // Quick styles tab
  selectedElementRef,
  ffGroup,
  onApplyPreset,
  onApplyCustom,
  onApplyTempStyle,
  onClearTempStyles,
  isQuickStylesProcessing,
}: InspectorPanelProps) {
  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const hasSelection = !!selectedElementRef;

  return (
    <div className="w-80 h-full flex flex-col shadow-2xl" style={{ backgroundColor: 'var(--theme-surface)', borderLeft: '1px solid var(--theme-border)' }}>
      {/* Header with selection info */}
      <div className="flex-none" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface-dark)' }}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
              <MousePointer2 className="w-3.5 h-3.5" style={{ color: 'var(--color-feature)' }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Inspector</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected element banner */}
        <div className="px-3 pb-2">
          {hasSelection ? (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-feature-subtle)', border: '1px solid var(--color-feature)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-feature)' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {componentName && (
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-feature)' }}>{componentName}</span>
                  )}
                  {!componentName && selectedElementRef && (
                    <span className="text-xs font-mono" style={{ color: 'var(--color-feature)' }}>Element</span>
                  )}
                </div>
                {selectedElementRef && (
                  <p className="text-[10px] font-mono truncate" style={{ color: 'var(--theme-text-dim)' }}>
                    #{selectedElementRef.slice(0, 12)}...
                  </p>
                )}
              </div>
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-feature)', opacity: 0.5 }} />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
              <MousePointer2 className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
              <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>No element selected</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-none flex px-1 py-1 gap-0.5" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            disabled={!hasSelection}
            title={tab.description}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all"
            style={{
              color: activeTab === tab.id && hasSelection
                ? 'var(--color-feature)'
                : hasSelection
                  ? 'var(--theme-text-muted)'
                  : 'var(--theme-text-dim)',
              backgroundColor: activeTab === tab.id && hasSelection
                ? 'var(--color-feature-subtle)'
                : 'transparent',
              cursor: hasSelection ? 'pointer' : 'not-allowed'
            }}
          >
            <TabIcon icon={tab.icon} className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!hasSelection ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center" style={{ color: 'var(--theme-text-dim)' }}>
            <MousePointer2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--theme-text-muted)' }}>Select an Element</p>
            <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
              Click on any element in the preview to inspect its styles, props, and apply AI-powered changes.
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'styles' && (
              <StylesTab
                styles={computedStyles}
                tailwindClasses={tailwindClasses}
                isLoading={isStylesLoading}
                onCopy={handleCopy}
              />
            )}
            {activeTab === 'boxmodel' && (
              <BoxModelTab boxModel={computedStyles?.boxModel || null} isLoading={isStylesLoading} />
            )}
            {activeTab === 'props' && (
              <PropsTab
                props={componentProps}
                state={componentState}
                componentName={componentName}
                isLoading={isPropsLoading}
              />
            )}
            {activeTab === 'quickstyles' && (
              <QuickStylesTab
                elementRef={selectedElementRef}
                ffGroup={ffGroup}
                onApplyPreset={onApplyPreset}
                onApplyCustom={onApplyCustom}
                onApplyTempStyle={onApplyTempStyle}
                onClearTempStyles={onClearTempStyles}
                isProcessing={isQuickStylesProcessing}
              />
            )}
          </>
        )}
      </div>

      {/* Footer hint */}
      {hasSelection && (
        <div className="flex-none px-3 py-2" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <p className="text-[10px] text-center" style={{ color: 'var(--theme-text-dim)' }}>
            {activeTab === 'quickstyles'
              ? 'AI will modify your code based on the selected preset'
              : activeTab === 'styles'
                ? 'Click any value to copy to clipboard'
                : activeTab === 'props'
                  ? 'View React component props and state'
                  : 'Box model shows padding, border, margin'
            }
          </p>
        </div>
      )}
    </div>
  );
});

// Re-export types and components
export type { InspectorTab, InspectorPanelProps } from './types';
export { StylesTab } from './StylesTab';
export { BoxModelTab } from './BoxModelTab';
export { PropsTab } from './PropsTab';
export { QuickStylesTab } from './QuickStylesTab';
