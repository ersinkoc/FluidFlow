/**
 * DevToolsPanel - Chrome-like developer tools panel
 *
 * Features:
 * - Console tab: Log messages with error fixing
 * - Network tab: HTTP requests monitoring
 * - Elements tab: React component tree inspection
 * - Resizable panel height
 * - Tab navigation with badges
 */

import React, { memo } from 'react';
import { Terminal, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { ConsoleTab } from './ConsoleTab';
import { NetworkTab } from './NetworkTab';
import { ElementsTab } from './ElementsTab';
import type { DevToolsPanelProps, DevToolsTab, DevToolsTabConfig } from './types';

const TABS: DevToolsTabConfig[] = [
  { id: 'console', label: 'Console', color: 'blue' },
  { id: 'network', label: 'Network', color: 'emerald' },
  { id: 'elements', label: 'Elements', color: 'purple' },
];

export const DevToolsPanel = memo(function DevToolsPanel({
  logs,
  networkLogs,
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  onClearLogs,
  onClearNetwork,
  onFixError,
  // Elements tab props
  componentTree,
  selectedNodeId,
  expandedNodes = new Set(),
  onSelectNode,
  onToggleExpand,
  onHoverNode,
  onRefreshTree,
  isTreeLoading = false,
}: DevToolsPanelProps) {
  const getTabStyles = (tabId: DevToolsTab, isActive: boolean): React.CSSProperties => {
    if (!isActive) {
      return { color: 'var(--theme-text-dim)' };
    }
    switch (tabId) {
      case 'console':
        return { backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' };
      case 'network':
        return { backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' };
      case 'elements':
        return { backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' };
      default:
        return { backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' };
    }
  };

  const getBadge = (tabId: DevToolsTab) => {
    switch (tabId) {
      case 'console':
        return logs.length > 0 ? logs.length : undefined;
      case 'network':
        return networkLogs.length > 0 ? networkLogs.length : undefined;
      default:
        return undefined;
    }
  };

  const handleClear = () => {
    if (activeTab === 'console') {
      onClearLogs();
    } else if (activeTab === 'network') {
      onClearNetwork();
    }
  };

  const canClear = activeTab === 'console' || activeTab === 'network';

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 transition-[height] duration-300 ease-out flex flex-col shadow-2xl z-40 ${
        isOpen ? 'h-64' : 'h-8'
      }`}
      style={{ position: 'absolute', backgroundColor: 'var(--theme-surface)', borderTop: '1px solid var(--theme-border)' }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        className="h-8 cursor-pointer flex items-center justify-between px-4 select-none transition-colors"
        style={{ backgroundColor: 'var(--theme-background)', borderBottom: '1px solid var(--theme-border-light)' }}
        role="button"
        aria-expanded={isOpen}
        aria-label="Toggle DevTools panel"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--theme-text-muted)' }}>
            <Terminal className="w-3 h-3" style={{ color: 'var(--color-info)' }} />
            <span className="font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>DevTools</span>
          </div>

          {isOpen && (
            <div
              className="flex items-center gap-1 p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {TABS.map((tab) => {
                const badge = getBadge(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className="px-3 py-0.5 rounded text-[10px] font-medium transition-colors"
                    style={getTabStyles(tab.id, activeTab === tab.id)}
                  >
                    {tab.label}
                    {badge !== undefined && ` (${badge})`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isOpen && canClear && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{ color: 'var(--theme-text-dim)' }}
              title="Clear"
              aria-label={`Clear ${activeTab}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <div style={{ color: 'var(--theme-text-dim)' }}>
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </div>
        </div>
      </div>

      {/* Panel Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px] custom-scrollbar" style={{ backgroundColor: 'var(--theme-code-bg)' }}>
          {activeTab === 'console' && <ConsoleTab logs={logs} onClear={onClearLogs} onFixError={onFixError} />}
          {activeTab === 'network' && <NetworkTab requests={networkLogs} onClear={onClearNetwork} />}
          {activeTab === 'elements' && (
            <ElementsTab
              tree={componentTree ?? null}
              selectedNodeId={selectedNodeId ?? null}
              expandedNodes={expandedNodes}
              onSelectNode={onSelectNode ?? (() => {})}
              onToggleExpand={onToggleExpand ?? (() => {})}
              onHoverNode={onHoverNode ?? (() => {})}
              onRefresh={onRefreshTree ?? (() => {})}
              isLoading={isTreeLoading}
            />
          )}
        </div>
      )}
    </div>
  );
});

// Re-export types
export type { DevToolsTab, DevToolsTabConfig, DevToolsPanelProps } from './types';
