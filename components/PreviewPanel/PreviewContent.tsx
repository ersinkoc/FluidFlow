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
  Undo2,
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
import { useToast } from '../Toast';

/**
 * Grouped props interfaces for better organization
 * Reduced from 110+ individual props to ~12 prop groups
 */

/** Core preview rendering props */
interface PreviewCoreProps {
  appCode: string | undefined;
  iframeSrc: string;
  iframeKey: number;
  previewDevice: PreviewDevice;
}

/** Generation and fixing state */
interface PreviewStateProps {
  isGenerating: boolean;
  isFixingResp: boolean;
}

/** Console and network logs management */
interface PreviewLogsProps {
  logs: LogEntry[];
  networkLogs: NetworkRequest[];
  isConsoleOpen: boolean;
  activeTerminalTab: TerminalTab;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  setNetworkLogs: React.Dispatch<React.SetStateAction<NetworkRequest[]>>;
  setIsConsoleOpen: (v: boolean) => void;
  setActiveTerminalTab: (t: TerminalTab) => void;
  fixError: (id: string, msg: string) => void;
}

/** Auto-fix functionality */
interface PreviewAutoFixProps {
  autoFixToast: string | null;
  isAutoFixing: boolean;
  pendingAutoFix: string | null;
  failedAutoFixError: string | null;
  handleConfirmAutoFix: () => void;
  handleDeclineAutoFix: () => void;
  handleSendErrorToChat: () => void;
  handleDismissFailedError: () => void;
  onSendErrorToChat?: (errorMessage: string) => void;
}

/** Inspect mode state and actions */
interface PreviewInspectProps {
  isInspectMode: boolean;
  isInspectEditing: boolean;
  hoveredElement: { top: number; left: number; width: number; height: number } | null;
  inspectedElement: InspectedElement | null;
  onCloseInspector: () => void;
  onInspectEdit: (prompt: string, element: InspectedElement, scope: EditScope) => void;
}

/** URL bar navigation */
interface PreviewNavigationProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
}

/** Component tree inspection (Elements tab) */
interface PreviewElementsTreeProps {
  componentTree?: ComponentTreeNode | null;
  selectedNodeId?: string | null;
  expandedNodes?: Set<string>;
  isTreeLoading?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onToggleExpand?: (nodeId: string) => void;
  onHoverNode?: (nodeId: string | null) => void;
  onRefreshTree?: () => void;
}

/** Inspector panel state (CSS/Props inspection) */
interface PreviewInspectorPanelProps {
  isInspectorPanelOpen?: boolean;
  inspectorActiveTab?: InspectorTab;
  onInspectorTabChange?: (tab: InspectorTab) => void;
  onCloseInspectorPanel?: () => void;
}

/** Computed styles data */
interface PreviewStylesDataProps {
  computedStyles?: ComputedStylesResult | null;
  tailwindClasses?: TailwindClassInfo[];
  isStylesLoading?: boolean;
}

/** Component props data */
interface PreviewComponentPropsData {
  componentProps?: Record<string, unknown> | null;
  componentState?: Array<{ index: number; value: unknown }> | null;
  componentName?: string | null;
  isPropsLoading?: boolean;
}

/** Quick style application */
interface PreviewQuickStylesProps {
  selectedElementRef?: string | null;
  ffGroup?: string | null;
  isQuickStylesProcessing?: boolean;
  onApplyPreset?: (prompt: string, scope: EditScope) => void;
  onApplyCustomStyle?: (prompt: string, scope: EditScope) => void;
  onApplyTempStyle?: (styles: Record<string, string>) => void;
  onClearTempStyles?: () => void;
}

/** Revert and retry functionality */
interface PreviewRevertProps {
  onRevertAndRetry?: () => void;
  onRevertOnly?: () => boolean;
  canRevertAndRetry?: boolean;
  canRevert?: boolean;
  lastPrompt?: string | null;
}

/** Main props interface using grouped interfaces */
export interface PreviewContentProps {
  /** Core preview rendering */
  core: PreviewCoreProps;
  /** Generation state */
  state: PreviewStateProps;
  /** Logs management */
  logs: PreviewLogsProps;
  /** Auto-fix functionality */
  autoFix: PreviewAutoFixProps;
  /** Inspect mode */
  inspect: PreviewInspectProps;
  /** URL navigation */
  navigation: PreviewNavigationProps;
  /** Elements tree (optional) */
  elementsTree?: PreviewElementsTreeProps;
  /** Inspector panel (optional) */
  inspectorPanel?: PreviewInspectorPanelProps;
  /** Styles data (optional) */
  styles?: PreviewStylesDataProps;
  /** Component props data (optional) */
  componentData?: PreviewComponentPropsData;
  /** Quick styles (optional) */
  quickStyles?: PreviewQuickStylesProps;
  /** Revert functionality (optional) */
  revert?: PreviewRevertProps;
}

export const PreviewContent = memo(function PreviewContent(props: PreviewContentProps) {
  // Destructure grouped props with defaults for optional groups
  const {
    core,
    state,
    logs,
    autoFix,
    inspect,
    navigation,
    elementsTree,
    inspectorPanel,
    styles,
    componentData,
    quickStyles,
    revert,
  } = props;

  // Extract core props
  const { appCode, iframeSrc, iframeKey, previewDevice } = core;

  // Extract state props
  const { isGenerating, isFixingResp } = state;

  // Extract logs props
  const {
    logs: logEntries,
    networkLogs,
    isConsoleOpen,
    activeTerminalTab,
    setLogs,
    setNetworkLogs,
    setIsConsoleOpen,
    setActiveTerminalTab,
    fixError,
  } = logs;

  // Extract auto-fix props
  const {
    autoFixToast,
    isAutoFixing,
    pendingAutoFix,
    failedAutoFixError,
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    handleSendErrorToChat,
    handleDismissFailedError,
    onSendErrorToChat,
  } = autoFix;

  // Extract inspect props
  const {
    isInspectMode,
    isInspectEditing,
    hoveredElement,
    inspectedElement,
    onCloseInspector,
    onInspectEdit,
  } = inspect;

  // Extract navigation props
  const {
    iframeRef,
    currentUrl,
    canGoBack,
    canGoForward,
    onNavigate,
    onGoBack,
    onGoForward,
    onReload,
  } = navigation;

  // Extract optional elements tree props with defaults
  const {
    componentTree,
    selectedNodeId,
    expandedNodes,
    isTreeLoading = false,
    onSelectNode,
    onToggleExpand,
    onHoverNode,
    onRefreshTree,
  } = elementsTree || {};

  // Extract optional inspector panel props with defaults
  const {
    isInspectorPanelOpen = false,
    inspectorActiveTab = 'styles',
    onInspectorTabChange,
    onCloseInspectorPanel,
  } = inspectorPanel || {};

  // Extract optional styles props with defaults
  const {
    computedStyles,
    tailwindClasses = [],
    isStylesLoading = false,
  } = styles || {};

  // Extract optional component data props with defaults
  const {
    componentProps,
    componentState,
    componentName,
    isPropsLoading = false,
  } = componentData || {};

  // Extract optional quick styles props with defaults
  const {
    selectedElementRef,
    ffGroup,
    isQuickStylesProcessing = false,
    onApplyPreset,
    onApplyCustomStyle,
    onApplyTempStyle,
    onClearTempStyles,
  } = quickStyles || {};

  // Extract optional revert props with defaults
  const {
    onRevertAndRetry,
    onRevertOnly,
    canRevertAndRetry = false,
    canRevert = false,
    lastPrompt,
  } = revert || {};

  // Toast for notifications
  const toast = useToast();

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
      // Send cleanup message to iframe before revoking URL.
      // Use parent's origin as postMessage target — never use '*'
      // (would expose the message to any listener).
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'CLEANUP_BLOB_URLS' }, window.location.origin);
        } catch {
          // Ignore errors if iframe is already destroyed
        }
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl, iframeRef]);

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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-100 px-4 py-3 rounded-xl shadow-lg backdrop-blur-xl animate-in slide-in-from-top-2 duration-300 max-w-lg" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
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
              <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{pendingAutoFix}</p>

              {/* Show last prompt if available for context */}
              {lastPrompt && canRevert && (
                <p className="text-[10px] mb-2 px-2 py-1 rounded" style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-dim)' }}>
                  Last prompt: "{lastPrompt.length > 60 ? lastPrompt.slice(0, 60) + '...' : lastPrompt}"
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {/* Revert Only - just undo without retry */}
                {canRevert && onRevertOnly && (
                  <button
                    onClick={() => {
                      handleDeclineAutoFix();
                      const success = onRevertOnly();
                      if (success) {
                        toast.success('Reverted to previous state');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
                    title="Undo the last AI changes"
                  >
                    <Undo2 className="w-3 h-3" />
                    Revert
                  </button>
                )}
                {/* Revert & Retry - undo and resend the prompt */}
                {canRevertAndRetry && onRevertAndRetry && (
                  <button
                    onClick={() => {
                      handleDeclineAutoFix();
                      onRevertAndRetry();
                      toast.info('Reverting and retrying with AI...');
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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-100 max-w-lg w-full px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-error-subtle)' }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-error)' }}>Auto-fix Failed</h4>
                  <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--color-error)', opacity: 0.7 }}>
                    {failedAutoFixError.slice(0, 150)}
                    {failedAutoFixError.length > 150 ? '...' : ''}
                  </p>

                  {/* Show last prompt if available for context */}
                  {lastPrompt && canRevert && (
                    <p className="text-[10px] mb-2 px-2 py-1 rounded" style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-dim)' }}>
                      Last prompt: "{lastPrompt.length > 60 ? lastPrompt.slice(0, 60) + '...' : lastPrompt}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Revert Only - most prominent as primary recovery option */}
                    {canRevert && onRevertOnly && (
                      <button
                        onClick={() => {
                          handleDismissFailedError();
                          const success = onRevertOnly();
                          if (success) {
                            toast.success('Reverted to previous state');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
                        title="Undo the last AI changes"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Revert
                      </button>
                    )}
                    {canRevertAndRetry && onRevertAndRetry && (
                      <button
                        onClick={() => {
                          handleDismissFailedError();
                          onRevertAndRetry();
                          toast.info('Reverting and retrying with AI...');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
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
                  sandbox="allow-scripts"
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
          logs={logEntries}
          networkLogs={networkLogs}
          isOpen={isConsoleOpen}
          onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
          activeTab={activeTerminalTab}
          onTabChange={setActiveTerminalTab}
          onClearLogs={() => setLogs([])}
          onClearNetwork={() => setNetworkLogs([])}
          onFixError={fixError}
          // Revert functionality for console errors
          onRevert={onRevertOnly}
          canRevert={canRevert}
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
