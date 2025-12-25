/**
 * PreviewContent Component
 *
 * Renders the main preview area with device simulation,
 * URL bar navigation, and console panel.
 * Extracted from PreviewPanel/index.tsx to reduce complexity.
 */

import React, { useState, useEffect } from 'react';
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
}

export const PreviewContent: React.FC<PreviewContentProps> = (props) => {
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
  } = props;

  // Local state for URL input
  const [urlInput, setUrlInput] = useState(currentUrl);

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
    <div className="flex-1 min-h-0 h-full overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Auto-fix Confirmation Dialog - AI assistance (simple fix already tried) */}
      {pendingAutoFix && !isAutoFixing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg backdrop-blur-xl border bg-orange-500/10 border-orange-500/30 animate-in slide-in-from-top-2 duration-300 max-w-md">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-orange-500/20 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-orange-300">Error Detected</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  AI Fix
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3 line-clamp-2">{pendingAutoFix}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmAutoFix}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Fix with AI
                </button>
                <button
                  onClick={handleDeclineAutoFix}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-300 text-xs font-medium transition-colors"
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
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg backdrop-blur-xl border animate-in slide-in-from-top-2 duration-300 ${
            isAutoFixing
              ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
              : autoFixToast.includes('✅')
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                  ? 'bg-red-500/20 border-red-500/30 text-red-300'
                  : 'bg-slate-500/20 border-slate-500/30 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {isAutoFixing && <Loader2 className="w-4 h-4 animate-spin" />}
            {autoFixToast}
          </div>
        </div>
      )}

      {/* Failed Auto-fix Notification - Persistent with Send to Chat option */}
      {failedAutoFixError && !autoFixToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] max-w-md w-full px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-red-300 mb-1">Auto-fix Failed</h4>
                  <p className="text-xs text-red-300/70 line-clamp-2 mb-3">
                    {failedAutoFixError.slice(0, 150)}
                    {failedAutoFixError.length > 150 ? '...' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    {onSendErrorToChat && (
                      <button
                        onClick={handleSendErrorToChat}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-300 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Send to Chat
                      </button>
                    )}
                    <button
                      onClick={handleDismissFailedError}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-500/20 hover:bg-slate-500/30 border border-slate-500/30 rounded-lg text-xs font-medium text-slate-300 transition-colors"
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
        className="flex overflow-hidden relative z-10 transition-all duration-300"
        style={contentStyle}
      >
        {/* Main preview area */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
        {appCode ? (
          <div
            className={`relative z-10 transition-all duration-500 ease-in-out bg-slate-950 shadow-2xl overflow-hidden flex flex-col ${
              previewDevice === 'mobile'
                ? 'w-[375px] h-[667px] max-h-full rounded-[40px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]'
                : previewDevice === 'tablet'
                  ? 'w-[768px] h-[90%] max-h-[800px] rounded-[24px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]'
                  : 'w-full h-full rounded-none border-none'
            }`}
          >
            {previewDevice === 'mobile' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2 pointer-events-none">
                <div className="w-12 h-1.5 rounded-full bg-slate-800/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800/80" />
              </div>
            )}

            {/* URL Bar */}
            <div
              className={`flex-none flex items-center gap-1.5 px-2 py-1.5 bg-slate-900/95 border-b border-white/5 ${previewDevice === 'mobile' ? 'pt-8' : ''}`}
            >
              {/* Navigation Buttons */}
              <button
                onClick={onGoBack}
                disabled={!canGoBack}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onGoForward}
                disabled={!canGoForward}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go Forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={onReload}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Reload"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* URL Input */}
              <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-white/5 rounded-lg">
                  <Globe className="w-3.5 h-3.5 text-slate-500 flex-none" />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setUrlInput(currentUrl)}
                    className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-500 outline-none font-mono"
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

            {/* iframe container with inspect overlay */}
            <div className="flex-1 relative overflow-hidden">
              <iframe
                ref={iframeRef}
                key={iframeKey}
                srcDoc={iframeSrc}
                title="Preview"
                className={`w-full h-full bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`}
                sandbox="allow-scripts allow-same-origin"
              />

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
              <div className="relative w-[375px] h-[812px] bg-black rounded-[48px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10 z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center gap-3">
                  <div className="w-10 h-1 rounded-full bg-slate-800/50" />
                  <div className="w-2 h-2 rounded-full bg-slate-800/80" />
                </div>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <p className="text-slate-700 font-medium text-sm">
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
};
