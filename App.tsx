/**
 * App.tsx - Main Application Component
 *
 * This component now uses AppContext for centralized state management.
 * Most state and logic has been moved to AppContext to reduce prop drilling.
 *
 * What remains here:
 * - Modal management (useModalManager)
 * - UI-specific callbacks (handleInspectEdit, handleModelChange)
 * - First-visit credits modal logic
 * - URL project loading
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { CREDITS_MODAL_DELAY_MS } from '@/constants';
import { ControlPanel, ControlPanelRef } from './components/ControlPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { SnippetsPanel } from './components/SnippetsPanel';
import { DeployModal } from './components/DeployModal';
import { ShareModal, loadProjectFromUrl } from './components/ShareModal';
import { HistoryPanel } from './components/HistoryPanel';
import { ProjectManager } from './components/ProjectManager';
import { SyncConfirmationDialog } from './components/SyncConfirmationDialog';
import { DiffModal } from './components/DiffModal';
import { PromptHistoryModal } from './components/PromptHistoryModal';
import { useModalManager } from './hooks/useModalManager';
import { useAppContext } from './contexts/AppContext';
import { useAutoCommit } from './hooks/useAutoCommit';
import { Undo2, Redo2, History, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { InspectedElement, EditScope } from './components/PreviewPanel/ComponentInspector';
import { getContextManager } from './services/conversationContext';
import { ToastProvider } from './components/Toast';
import { ContextMenuProvider } from './components/ContextMenu';

// Lazy-loaded modals for better initial bundle size (~80KB savings)
import {
  LazyAISettingsModal,
  LazyMegaSettingsModal,
  LazyCreditsModal,
  LazyCodeMapModal,
  LazyTailwindPalette,
  LazyComponentTree,
} from './components/LazyModals';

// Re-export types for backwards compatibility
export type { FileSystem } from './types';

export default function App() {
  // Get all state from context
  const ctx = useAppContext();

  // Centralized modal state management
  const modals = useModalManager();
  const [megaSettingsInitialCategory] = useState<'ai-providers' | 'context-manager' | 'tech-stack' | 'projects' | 'editor' | 'appearance' | 'debug' | 'shortcuts' | 'advanced'>('ai-providers');

  // Preview error tracking for auto-commit
  const [previewHasErrors, setPreviewHasErrors] = useState(false);

  // Runner status for Start Fresh modal
  const [hasRunningServer, setHasRunningServer] = useState(false);

  // Prompt History state
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [historyPrompt, setHistoryPrompt] = useState<string | undefined>();

  // Auto-commit feature: commits when preview is error-free
  const { isAutoCommitting } = useAutoCommit({
    enabled: ctx.autoCommitEnabled,
    files: ctx.files,
    hasUncommittedChanges: ctx.hasUncommittedChanges,
    previewHasErrors,
    gitInitialized: ctx.gitStatus?.initialized ?? false,
    localChanges: ctx.localChanges,
    onCommit: ctx.commit,
  });

  // Toggle auto-commit
  const handleToggleAutoCommit = useCallback(() => {
    ctx.setAutoCommitEnabled(!ctx.autoCommitEnabled);
  }, [ctx]);

  // Reset key for ControlPanel re-mount
  const [resetKey, setResetKey] = useState(0);

  // ControlPanel ref for inspect edit handler
  const controlPanelRef = useRef<ControlPanelRef>(null);

  // Track active file in ref for stale closure handling
  const activeFileRef = useRef(ctx.activeFile);
  useEffect(() => {
    activeFileRef.current = ctx.activeFile;
  }, [ctx.activeFile]);

  // Track selected model in ref for stale closure handling
  const selectedModelRef = useRef(ctx.selectedModel);
  useEffect(() => {
    selectedModelRef.current = ctx.selectedModel;
  }, [ctx.selectedModel]);

  // Handler for inspect edit from PreviewPanel
  const handleInspectEdit = useCallback(async (prompt: string, element: InspectedElement, scope: EditScope) => {
    if (controlPanelRef.current) {
      await controlPanelRef.current.handleInspectEdit(prompt, element, scope);
    }
  }, []);

  // Handle model/provider change - also clears conversation context
  const handleModelChange = useCallback((newModel: string) => {
    if (newModel !== selectedModelRef.current) {
      ctx.setSelectedModel(newModel);
      // Clear the main chat context when model changes
      const contextManager = getContextManager();
      contextManager.clearContext('main-chat');
      console.log('[App] Model changed, context cleared:', newModel);
    }
  }, [ctx]);

  // Load project from URL if present (for shared projects)
  useEffect(() => {
    const urlProject = loadProjectFromUrl();
    if (urlProject && Object.keys(urlProject).length > 0) {
      ctx.setFiles(urlProject);
      // Select first src file
      const firstSrc = Object.keys(urlProject).find(f => f.startsWith('src/'));
      if (firstSrc) ctx.setActiveFile(firstSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if first visit and show credits
  useEffect(() => {
    const hasVisited = localStorage.getItem('fluidflow-visited');
    if (!hasVisited) {
      localStorage.setItem('fluidflow-visited', 'true');
      setTimeout(() => {
        modals.open('credits');
      }, CREDITS_MODAL_DELAY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enhanced resetApp that also resets resetKey
  const handleResetApp = useCallback(() => {
    ctx.resetApp();
    setResetKey(prev => prev + 1);
  }, [ctx]);

  return (
    <ContextMenuProvider>
      <ToastProvider>
        <div className="fixed inset-0 flex flex-col bg-[#020617] text-white overflow-hidden selection:bg-blue-500/30 selection:text-blue-50">
      {/* Background Ambient Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

      <main className="flex flex-col md:flex-row flex-1 min-h-0 w-full p-4 gap-4 z-10 overflow-hidden">
        <ControlPanel
          ref={controlPanelRef}
          key={resetKey}
          resetApp={handleResetApp}
          files={ctx.files}
          setFiles={ctx.setFiles}
          activeFile={ctx.activeFile}
          setActiveFile={ctx.setActiveFile}
          setSuggestions={ctx.setSuggestions}
          isGenerating={ctx.isGenerating}
          setIsGenerating={ctx.setIsGenerating}
          reviewChange={ctx.reviewChange}
          selectedModel={ctx.selectedModel}
          onModelChange={handleModelChange}
          onOpenAISettings={() => modals.open('aiSettings')}
          onOpenMegaSettings={() => modals.open('megaSettings')}
          onOpenCodeMap={() => modals.open('codeMap')}
          autoAcceptChanges={ctx.autoAcceptChanges}
          onAutoAcceptChangesChange={ctx.setAutoAcceptChanges}
          diffModeEnabled={ctx.diffModeEnabled}
          onDiffModeChange={ctx.setDiffModeEnabled}
          // Project props
          currentProject={ctx.currentProject}
          projects={ctx.projects}
          isServerOnline={ctx.isServerOnline}
          isSyncing={ctx.isSyncing}
          lastSyncedAt={ctx.lastSyncedAt}
          isLoadingProjects={ctx.isLoadingProjects}
          // Git status props
          gitStatus={ctx.gitStatus}
          hasUncommittedChanges={ctx.hasUncommittedChanges}
          onOpenGitTab={() => ctx.setActiveTab('git')}
          // Auto-commit feature
          autoCommitEnabled={ctx.autoCommitEnabled}
          onToggleAutoCommit={handleToggleAutoCommit}
          isAutoCommitting={isAutoCommitting}
          // History Timeline checkpoint
          onSaveCheckpoint={ctx.saveSnapshot}
          onCreateProject={ctx.createProject}
          onOpenProject={async (id) => {
            const result = await ctx.openProject(id);
            return result.success;
          }}
          onDeleteProject={ctx.deleteProject}
          onDuplicateProject={ctx.duplicateProject}
          onRefreshProjects={ctx.refreshProjects}
          onCloseProject={ctx.closeProject}
          hasRunningServer={hasRunningServer}
          // Prompt History
          historyPrompt={historyPrompt}
          onOpenPromptHistory={() => setShowPromptHistory(true)}
        />
        <PreviewPanel
          files={ctx.files}
          setFiles={ctx.setFiles}
          activeFile={ctx.activeFile}
          setActiveFile={ctx.setActiveFile}
          suggestions={ctx.suggestions}
          setSuggestions={ctx.setSuggestions}
          isGenerating={ctx.isGenerating}
          reviewChange={ctx.reviewChange}
          selectedModel={ctx.selectedModel}
          activeTab={ctx.activeTab}
          setActiveTab={ctx.setActiveTab}
          onInspectEdit={handleInspectEdit}
          // Git props
          projectId={ctx.currentProject?.id}
          gitStatus={ctx.gitStatus}
          onInitGit={ctx.initGit}
          onCommit={ctx.commit}
          onRefreshGitStatus={ctx.refreshGitStatus}
          // Local changes (WIP)
          hasUncommittedChanges={ctx.hasUncommittedChanges}
          localChanges={ctx.localChanges}
          onDiscardChanges={ctx.discardChanges}
          onRevertToCommit={ctx.revertToCommit}
          onSendErrorToChat={(error) => controlPanelRef.current?.sendErrorToChat(error)}
          // Auto-commit error tracking
          onPreviewErrorsChange={setPreviewHasErrors}
          // Undo/Revert support for error fix panel
          onUndo={ctx.undo}
          canUndo={ctx.canUndo}
          // Runner status for Start Fresh modal
          onRunnerStatusChange={setHasRunningServer}
        />
      </main>

      {/* Diff Modal */}
      {ctx.pendingReview && (
        <DiffModal
          originalFiles={ctx.files}
          newFiles={ctx.pendingReview.newFiles}
          label={ctx.pendingReview.label}
          onConfirm={ctx.confirmChange}
          onCancel={ctx.cancelReview}
          incompleteFiles={ctx.pendingReview.incompleteFiles}
        />
      )}

      {/* Sync Confirmation Dialog */}
      {ctx.pendingSyncConfirmation && (
        <SyncConfirmationDialog
          confirmation={ctx.pendingSyncConfirmation}
          onConfirm={ctx.confirmPendingSync}
          onCancel={ctx.cancelPendingSync}
          isLoading={ctx.isSyncing}
        />
      )}

      {/* Snippets Panel */}
      <SnippetsPanel
        isOpen={modals.state.snippetsPanel}
        onClose={() => modals.close('snippetsPanel')}
        onInsert={(code: string) => {
          if (ctx.activeFile && ctx.files[ctx.activeFile]) {
            const newContent = ctx.files[ctx.activeFile] + '\n\n' + code;
            ctx.setFiles({ ...ctx.files, [ctx.activeFile]: newContent });
            ctx.setActiveTab('code');
          }
        }}
      />

      {/* Tailwind Palette (lazy-loaded) */}
      <LazyTailwindPalette
        isOpen={modals.state.tailwindPalette}
        onClose={() => modals.close('tailwindPalette')}
        onInsert={(className: string) => {
          navigator.clipboard.writeText(className);
        }}
      />

      {/* Component Tree (lazy-loaded) */}
      <LazyComponentTree
        isOpen={modals.state.componentTree}
        onClose={() => modals.close('componentTree')}
        files={ctx.files}
        onFileSelect={(file: string) => {
          ctx.setActiveFile(file);
          ctx.setActiveTab('code');
        }}
      />

      {/* Deploy Modal */}
      <DeployModal
        isOpen={modals.state.deploy}
        onClose={() => modals.close('deploy')}
        files={ctx.files}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={modals.state.share}
        onClose={() => modals.close('share')}
        files={ctx.files}
      />

      {/* AI Settings Modal (lazy-loaded) */}
      <LazyAISettingsModal
        isOpen={modals.state.aiSettings}
        onClose={() => modals.close('aiSettings')}
        onProviderChange={(_providerId, modelId) => handleModelChange(modelId)}
      />

      {/* Mega Settings Modal (lazy-loaded) */}
      <LazyMegaSettingsModal
        isOpen={modals.state.megaSettings}
        onClose={() => modals.close('megaSettings')}
        initialCategory={megaSettingsInitialCategory}
        onProviderChange={(_providerId, modelId) => handleModelChange(modelId)}
      />

      {/* Floating History Toolbar */}
      <div className={`fixed bottom-6 z-50 flex items-center gap-1 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl p-1 shadow-2xl transition-all duration-300 ${modals.state.history ? 'right-[21rem]' : 'right-6'}`}>
        {/* Undo */}
        <button
          onClick={ctx.undo}
          disabled={!ctx.canUndo}
          className={`p-2 rounded-lg transition-all ${
            ctx.canUndo
              ? 'hover:bg-white/10 text-white'
              : 'text-slate-600 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Position Indicator */}
        <button
          onClick={() => modals.toggle('history')}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors group"
          title="History Timeline (Ctrl+Shift+H)"
        >
          <ChevronLeft
            className={`w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors ${!ctx.canUndo ? 'opacity-30' : ''}`}
          />
          <span className="text-xs font-mono text-slate-400 group-hover:text-white transition-colors min-w-[3rem] text-center">
            {ctx.currentIndex + 1} / {ctx.historyLength}
          </span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors ${!ctx.canRedo ? 'opacity-30' : ''}`}
          />
        </button>

        {/* Redo */}
        <button
          onClick={ctx.redo}
          disabled={!ctx.canRedo}
          className={`p-2 rounded-lg transition-all ${
            ctx.canRedo
              ? 'hover:bg-white/10 text-white'
              : 'text-slate-600 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-white/10" />

        {/* History Panel Toggle */}
        <button
          onClick={() => modals.toggle('history')}
          className={`p-2 rounded-lg transition-all ${
            modals.state.history
              ? 'bg-blue-500/20 text-blue-400'
              : 'hover:bg-white/10 text-slate-400 hover:text-white'
          }`}
          title="History Timeline (Ctrl+Shift+H)"
        >
          <History className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-white/10" />

        {/* Credits */}
        <button
          onClick={() => modals.open('credits')}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
          title="About FluidFlow"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* History Panel */}
      <HistoryPanel
        isOpen={modals.state.history}
        onClose={() => modals.close('history')}
        history={ctx.history}
        currentIndex={ctx.currentIndex}
        onGoToIndex={ctx.goToIndex}
        onSaveSnapshot={ctx.saveSnapshot}
      />

      {/* Project Manager */}
      <ProjectManager
        isOpen={modals.state.projectManager}
        onClose={() => modals.close('projectManager')}
        projects={ctx.projects}
        currentProjectId={ctx.currentProject?.id}
        isLoading={ctx.isLoadingProjects}
        isServerOnline={ctx.isServerOnline}
        onCreateProject={async (name, description) => {
          const newProject = await ctx.createProject(name || 'Untitled', description);
          if (newProject) {
            modals.close('projectManager');
          }
        }}
        onOpenProject={async (id) => {
          const result = await ctx.openProject(id);
          if (result.success) {
            modals.close('projectManager');
          }
        }}
        onDeleteProject={async (id) => { await ctx.deleteProject(id); }}
        onDuplicateProject={async (id) => { await ctx.duplicateProject(id); }}
        onRefresh={ctx.refreshProjects}
      />

      {/* Credits Modal (lazy-loaded) */}
      <LazyCreditsModal
        isOpen={modals.state.credits}
        onClose={() => modals.close('credits')}
        showOnFirstLaunch={true}
      />

      {/* CodeMap Modal (lazy-loaded) */}
      <LazyCodeMapModal
        isOpen={modals.state.codeMap}
        onClose={() => modals.close('codeMap')}
        files={ctx.files}
      />

      {/* Prompt History Modal */}
      <PromptHistoryModal
        isOpen={showPromptHistory}
        onClose={() => setShowPromptHistory(false)}
        onSelectPrompt={(selectedPrompt) => {
          setHistoryPrompt(selectedPrompt);
        }}
      />
      </div>
    </ToastProvider>
    </ContextMenuProvider>
  );
}
