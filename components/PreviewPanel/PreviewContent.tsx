/**
 * PreviewContent Component
 *
 * Renders the main preview area with device simulation,
 * URL bar navigation, and console panel.
 * Extracted from PreviewPanel/index.tsx to reduce complexity.
 */

import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
  Zap,
  ChevronLeft,
  ChevronRight,
  Globe,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { LogEntry, NetworkRequest, PreviewDevice, TerminalTab } from '../../types';
import { DevToolsPanel } from './DevToolsPanel';
import { InspectorPanel } from './InspectorPanel';
import { GeneratingOverlay } from './GeneratingOverlay';
import type { InspectorTab } from './InspectorPanel/types';
import type { ComponentTreeNode, ComputedStylesResult } from '../../utils/sandboxHtml/scripts';
import type { TailwindClassInfo } from '../../utils/tailwindParser';
import type { EditScope } from './InspectorPanel/types';
import { ComponentInspector, InspectionOverlay, InspectedElement } from './ComponentInspector';

export interface PreviewContentProps {
  appCode: string | undefined;
  iframeSrc: string;
  previewDevice: PreviewDevice;
  isGenerating: boolean;
  isFixingResp: boolean;
  iframeKey: number;
  logs: LogEntry[];
  networkLogs: NetworkRequest[];
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  activeTerminalTab: TerminalTab;
  setActiveTerminalTab: (t: TerminalTab) => void;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  setNetworkLogs: React.Dispatch<React.SetStateAction<NetworkRequest[]>>;
  fixError: (id: string, msg: string) => void;
  autoFixToast: string | null;
  isAutoFixing: boolean;
  pendingAutoFix: string | null;
  handleConfirmAutoFix: () => void;
  handleDeclineAutoFix: () => void;
  failedAutoFixError: string | null;
  onSendErrorToChat?: (errorMessage: string) => void;
  handleSendErrorToChat: () => void;
  handleDismissFailedError: () => void;
  isInspectMode: boolean;
  hoveredElement: { top: number; left: number; width: number; height: number } | null;
  inspectedElement: InspectedElement | null;
  isInspectEditing: boolean;
  onCloseInspector: () => void;
  onInspectEdit: (prompt: string, element: InspectedElement, scope: EditScope) => void;
  // URL Bar props
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  // Elements tab props (optional - for component tree inspection)
  componentTree?: ComponentTreeNode | null;
  selectedNodeId?: string | null;
  expandedNodes?: Set<string>;
  onSelectNode?: (nodeId: string) => void;
  onToggleExpand?: (nodeId: string) => void;
  onHoverNode?: (nodeId: string | null) => void;
  onRefreshTree?: () => void;
  isTreeLoading?: boolean;
  // InspectorPanel props (optional - for CSS/props inspection)
  isInspectorPanelOpen?: boolean;
  inspectorActiveTab?: InspectorTab;
  onInspectorTabChange?: (tab: InspectorTab) => void;
  onCloseInspectorPanel?: () => void;
  // Styles data
  computedStyles?: ComputedStylesResult | null;
  tailwindClasses?: TailwindClassInfo[];
  isStylesLoading?: boolean;
  // Props data
  componentProps?: Record<string, unknown> | null;
  componentState?: Array<{ index: number; value: unknown }> | null;
  componentName?: string | null;
  isPropsLoading?: boolean;
  // Quick styles
  selectedElementRef?: string | null;
  ffGroup?: string | null;
  onApplyPreset?: (prompt: string, scope: EditScope) => void;
  onApplyCustomStyle?: (prompt: string, scope: EditScope) => void;
  onApplyTempStyle?: (styles: Record<string, string>) => void;
  onClearTempStyles?: () => void;
  isQuickStylesProcessing?: boolean;
  // Revert and retry when AI changes break the app
  onRevertAndRetry?: () => void;
  canRevertAndRetry?: boolean;
}

export const PreviewContent = memo(function PreviewContent(props: PreviewContentProps) {
  const {
    appCode,
    iframeSrc,
    previewDevice,
    isGenerating,
    isFixingResp,
    iframeKey,
    logs,
    networkLogs,
    isConsoleOpen,
    setIsConsoleOpen,
    activeTerminalTab,
    setActiveTerminalTab,
    setLogs,
    setNetworkLogs,
    fixError,
    autoFixToast,
    isAutoFixing,
    pendingAutoFix,
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    failedAutoFixError,
    onSendErrorToChat,
    handleSendErrorToChat,
    handleDismissFailedError,
    isInspectMode,
    hoveredElement,
    inspectedElement,
    isInspectEditing,
    onCloseInspector,
    onInspectEdit,
    iframeRef,
    currentUrl,
    canGoBack,
    canGoForward,
    onNavigate,
    onGoBack,
    onGoForward,
    onReload,
    // Elements tab props
    componentTree,
    selectedNodeId,
    expandedNodes,
    onSelectNode,
    onToggleExpand,
    onHoverNode,
    onRefreshTree,
    isTreeLoading,
    // InspectorPanel props
    isInspectorPanelOpen = false,
    inspectorActiveTab = 'styles',
    onInspectorTabChange,
    onCloseInspectorPanel,
    // Styles data
    computedStyles,
    tailwindClasses = [],
    isStylesLoading = false,
    // Props data
    componentProps,
    componentState,
    componentName,
    isPropsLoading = false,
    // Quick styles
    selectedElementRef,
    ffGroup,
    onApplyPreset,
    onApplyCustomStyle,
    onApplyTempStyle,
    onClearTempStyles,
    isQuickStylesProcessing = false,
    // Revert and retry
    onRevertAndRetry,
    canRevertAndRetry = false,
  } = props;

  // Local state for URL input
  const [urlInput, setUrlInput] = useState(currentUrl);

  // Convert HTML string to blob URL for complete iframe isolation
  // This prevents any CSS/JS from the generated content affecting the parent layout
  // Include iframeKey in dependencies to ensure fresh blob URLs on refresh
  // This is critical because iframe destroy triggers pagehide which cleans up internal blob URLs
  const blobUrl = useMemo(() => {
    if (!iframeSrc) return '';
    const blob = new Blob([iframeSrc], { type: 'text/html' });
    return URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc, iframeKey]);

  // Clean up blob URL when it changes or component unmounts
  useEffect(() => {
    // Copy ref to variable for cleanup function (React hooks lint rule)
    const iframe = iframeRef.current;

    return () => {
      // Send cleanup message to iframe before revoking URL
      // This allows the sandbox to revoke its internal blob URLs
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'CLEANUP_BLOB_URLS' }, '*');
        } catch {
          // Ignore errors if iframe is already destroyed
        }
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Ref for the preview container
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Scroll prevention as safety net (main fix is in sandbox HTML)
  useEffect(() => {
    const preventScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('scroll', preventScroll, { passive: false });

    // Aggressive interval-based scroll reset for first 5 seconds after iframe load
    const intervalId = setInterval(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 100);

    // Stop interval after 5 seconds
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 5000);

    return () => {
      window.removeEventListener('scroll', preventScroll);
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [iframeKey]); // Re-run when iframe reloads

  // Sync URL input with current URL
  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = urlInput.trim();
    if (!url.startsWith('/')) {
      url = '/' + url;
    }
    onNavigate(url);
  };

  // Calculate content area height based on console state (h-64 = 256px when open, h-8 = 32px when closed)
  const contentStyle = {
    height: isConsoleOpen ? 'calc(100% - 256px)' : 'calc(100% - 32px)',
  };

  return (
    <div
      ref={previewContainerRef}
      className="flex-1 min-h-0 h-full relative"
      style={{
        // Use overflow: clip for absolute isolation - stronger than hidden
        overflow: 'clip',
        // Prevent layout influence from children
        contain: 'layout paint',
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--theme-border) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--theme-border) 10%, transparent) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Auto-fix Confirmation Dialog - AI assistance (simple fix already tried) */}
      {pendingAutoFix && !isAutoFixing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg backdrop-blur-xl animate-in slide-in-from-top-2 duration-300 max-w-md" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>Error Detected</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-ai-subtle)', color: 'var(--theme-ai-accent)' }}>
                  AI Fix
                </span>
              </div>
              <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{pendingAutoFix}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {canRevertAndRetry && onRevertAndRetry && (
                  <button
                    onClick={() => {
                      handleDeclineAutoFix();
                      onRevertAndRetry();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                    title="Undo changes and resend the last prompt"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Revert & Retry
                  </button>
                )}
                <button
                  onClick={handleConfirmAutoFix}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--theme-ai-accent)', color: 'white' }}
                >
                  <Zap className="w-3 h-3" />
                  Fix with AI
                </button>
                <button
                  onClick={handleDeclineAutoFix}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-fix Toast Notification */}
      {autoFixToast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg backdrop-blur-xl animate-in slide-in-from-top-2 duration-300"
          style={{
            backgroundColor: isAutoFixing
              ? 'var(--color-info-subtle)'
              : autoFixToast.includes('✅')
                ? 'var(--color-success-subtle)'
                : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                  ? 'var(--color-error-subtle)'
                  : 'var(--theme-glass-200)',
            border: `1px solid ${isAutoFixing
              ? 'var(--color-info-border)'
              : autoFixToast.includes('✅')
                ? 'var(--color-success-border)'
                : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                  ? 'var(--color-error-border)'
                  : 'var(--theme-border)'}`,
            color: isAutoFixing
              ? 'var(--color-info)'
              : autoFixToast.includes('✅')
                ? 'var(--color-success)'
                : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                  ? 'var(--color-error)'
                  : 'var(--theme-text-secondary)'
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {isAutoFixing && <Loader2 className="w-4 h-4 animate-spin" />}
            {autoFixToast}
          </div>
        </div>
      )}

      {/* Failed Auto-fix Notification - Persistent with Send to Chat option */}
      {failedAutoFixError && !autoFixToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-100 max-w-md w-full px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-error-subtle)' }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-error)' }}>Auto-fix Failed</h4>
                  <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--color-error)', opacity: 0.7 }}>
                    {failedAutoFixError.slice(0, 150)}
                    {failedAutoFixError.length > 150 ? '...' : ''}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {canRevertAndRetry && onRevertAndRetry && (
                      <button
                        onClick={() => {
                          handleDismissFailedError();
                          onRevertAndRetry();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning)' }}
                        title="Undo changes and resend the last prompt"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Revert & Retry
                      </button>
                    )}
                    {onSendErrorToChat && (
                      <button
                        onClick={handleSendErrorToChat}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent-muted)', color: 'var(--theme-accent)' }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Send to Chat
                      </button>
                    )}
                    <button
                      onClick={handleDismissFailedError}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex relative z-10 transition-all duration-300 min-h-0"
        style={{
          ...contentStyle,
          // Use overflow: clip - stronger isolation
          overflow: 'clip',
        }}
      >
        {/* Main preview area - min-h-0 prevents flex from growing based on content */}
        <div
          className="flex-1 flex items-center justify-center min-h-0"
          style={{
            // Use overflow: clip - stronger than hidden
            overflow: 'clip',
            // Contain all layout/paint within this element
            contain: 'layout paint',
          }}
        >
        {appCode ? (
          <div
            className={`relative z-10 transition-all duration-500 ease-in-out shadow-2xl flex flex-col min-h-0 ${
              previewDevice === 'mobile'
                ? 'w-[375px] h-[667px] max-h-full rounded-[40px] border-[8px] ring-4'
                : previewDevice === 'tablet'
                  ? 'w-[768px] h-[90%] max-h-[800px] rounded-[24px] border-[8px] ring-4'
                  : 'w-full h-full rounded-none border-none'
            }`}
            style={{
              // Use overflow: clip - stronger than hidden, absolutely prevents overflow
              overflow: 'clip',
              // Layout containment without size (size breaks flex)
              contain: 'layout paint',
              isolation: 'isolate',
              backgroundColor: 'var(--theme-preview-bg)',
              borderColor: previewDevice !== 'desktop' ? 'var(--theme-preview-device-border)' : undefined,
              ...(previewDevice !== 'desktop' ? {
                boxShadow: '0 0 0 4px var(--theme-background), 0 0 50px color-mix(in srgb, var(--theme-background) 50%, transparent)'
              } : {})
            }}
          >
            {previewDevice === 'mobile' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2 pointer-events-none">
                <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-preview-device-notch)' }} />
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-preview-device-notch)', opacity: 0.9 }} />
              </div>
            )}

            {/* URL Bar */}
            <div
              className={`flex-none flex items-center gap-1.5 px-2 py-1.5 ${previewDevice === 'mobile' ? 'pt-8' : ''}`}
              style={{ backgroundColor: 'var(--theme-preview-urlbar-bg)', borderBottom: '1px solid var(--theme-border-light)' }}
            >
              {/* Navigation Buttons */}
              <button
                onClick={onGoBack}
                disabled={!canGoBack}
                className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors nav-button-preview"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Go Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onGoForward}
                disabled={!canGoForward}
                className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors nav-button-preview"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Go Forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onReload}
                className="p-1.5 rounded-md transition-colors nav-button-preview"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Reload"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* URL Input */}
              <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-border-light)' }}
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--theme-text-dim)' }} />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setUrlInput(currentUrl)}
                    className="flex-1 bg-transparent text-xs outline-none font-mono"
                    style={{ color: 'var(--theme-text-secondary)' }}
                    placeholder="/"
                    spellCheck={false}
                  />
                </div>
              </form>
            </div>

            {/* Generating Overlay with promotional content */}
            <GeneratingOverlay
              isGenerating={isGenerating || isFixingResp}
              isFixing={isFixingResp}
            />

            {/* iframe container with inspect overlay - fully isolated using blob URL */}
            <div
              className="flex-1 relative min-h-0"
              style={{
                // Use overflow: clip - stronger than hidden, doesn't create scroll container
                overflow: 'clip',
                // Layout containment (no size - breaks flex)
                contain: 'layout paint',
                isolation: 'isolate',
              }}
            >
              {/* Absolute wrapper - can use strict because it has explicit dimensions from inset-0 */}
              <div
                className="absolute inset-0"
                style={{
                  // Use overflow: clip for stronger isolation
                  overflow: 'clip',
                  // Strict containment is safe here because dimensions are explicit
                  contain: 'strict',
                }}
              >
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={blobUrl}
                  title="Preview"
                  className={`bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`}
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={() => {
                    // Reset parent scroll when iframe loads - prevents jump
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                  }}
                  style={{
                    display: 'block',
                    border: 'none',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    // Prevent any scroll behavior from iframe affecting parent
                    overscrollBehavior: 'contain',
                  }}
                />
              </div>

              {/* Inspect Mode Overlay - positioned relative to iframe only */}
              <InspectionOverlay
                isActive={isInspectMode}
                hoveredRect={hoveredElement}
                selectedRect={inspectedElement?.rect || null}
                selectedElement={inspectedElement}
              />
            </div>

            {/* Component Inspector Panel */}
            {inspectedElement && (
              <ComponentInspector
                element={inspectedElement}
                onClose={onCloseInspector}
                onSubmit={onInspectEdit}
                isProcessing={isInspectEditing}
              />
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="relative transition-all duration-500 ease-out transform scale-90 opacity-60">
              <div
                className="relative w-[375px] h-[812px] bg-black rounded-[48px] border-8 shadow-2xl overflow-hidden z-10"
                style={{ borderColor: 'var(--theme-preview-device-border)', boxShadow: '0 0 0 1px var(--theme-border-light)' }}
              >
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 rounded-b-2xl z-20 flex items-center justify-center gap-3"
                  style={{ backgroundColor: 'var(--theme-preview-urlbar-bg)' }}
                >
                  <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--theme-preview-device-notch)' }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-preview-device-notch)', opacity: 0.9 }} />
                </div>
                <div className="w-full h-full flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--theme-preview-bg)' }}>
                  <p className="font-medium text-sm" style={{ color: 'var(--theme-text-dim)' }}>
                    Upload a sketch to generate app
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Inspector Panel - Right sidebar */}
        <InspectorPanel
          isOpen={isInspectorPanelOpen}
          activeTab={inspectorActiveTab}
          onTabChange={onInspectorTabChange ?? (() => {})}
          onClose={onCloseInspectorPanel ?? (() => {})}
          computedStyles={computedStyles ?? null}
          tailwindClasses={tailwindClasses}
          isStylesLoading={isStylesLoading}
          componentProps={componentProps ?? null}
          componentState={componentState ?? null}
          componentName={componentName ?? null}
          isPropsLoading={isPropsLoading}
          selectedElementRef={selectedElementRef ?? null}
          ffGroup={ffGroup}
          onApplyPreset={onApplyPreset ?? (() => {})}
          onApplyCustom={onApplyCustomStyle ?? (() => {})}
          onApplyTempStyle={onApplyTempStyle ?? (async () => {})}
          onClearTempStyles={onClearTempStyles ?? (() => {})}
          isQuickStylesProcessing={isQuickStylesProcessing}
        />
      </div>

      {appCode && (
        <DevToolsPanel
          logs={logs}
          networkLogs={networkLogs}
          isOpen={isConsoleOpen}
          onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
          activeTab={activeTerminalTab}
          onTabChange={setActiveTerminalTab}
          onClearLogs={() => setLogs([])}
          onClearNetwork={() => setNetworkLogs([])}
          onFixError={fixError}
          // Elements tab props
          componentTree={componentTree}
          selectedNodeId={selectedNodeId}
          expandedNodes={expandedNodes}
          onSelectNode={onSelectNode}
          onToggleExpand={onToggleExpand}
          onHoverNode={onHoverNode}
          onRefreshTree={onRefreshTree}
          isTreeLoading={isTreeLoading}
        />
      )}
    </div>
  );
});
