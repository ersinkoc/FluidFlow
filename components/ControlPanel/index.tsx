import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Layers, RotateCcw, Settings, ChevronDown, SlidersHorizontal, Upload } from 'lucide-react';
import { FileSystem, ChatMessage, ChatAttachment, FileChange } from '../../types';
import { cleanGeneratedCode, parseMultiFileResponse } from '../../utils/cleanCode';
import { estimateTokenCount, calculateFileChanges } from './utils';
import { debugLog } from '../../hooks/useDebugStore';
import { useTechStack } from '../../hooks/useTechStack';
import { useGenerationState } from '../../hooks/useGenerationState';
import { useContinuationGeneration } from '../../hooks/useContinuationGeneration';
import { useInspectEdit, InspectContext } from '../../hooks/useInspectEdit';
import { useCodeGeneration } from '../../hooks/useCodeGeneration';
import { getProviderManager, GenerationRequest } from '../../services/ai';
import { SUGGESTIONS_SCHEMA } from '../../services/ai/utils/schemas';
import { InspectedElement, EditScope } from '../PreviewPanel/ComponentInspector';
import { useAIHistory } from '../../hooks/useAIHistory';
import { AIHistoryModal } from '../AIHistoryModal';
import { TechStackModal } from './TechStackModal';
import { PromptEngineerModal } from './PromptEngineerModal';
import { BatchGenerationModal } from './BatchGenerationModal';
import { getContextManager, CONTEXT_IDS } from '../../services/conversationContext';
import { ContextIndicator } from '../ContextIndicator';
import { getFluidFlowConfig } from '../../services/fluidflowConfig';

// Sub-components
import { ChatPanel } from './ChatPanel';
import { ChatInput } from './ChatInput';
import { CodebaseSyncModal } from '../CodebaseSyncModal';
import { SettingsPanel } from './SettingsPanel';
import { ModeToggle } from './ModeToggle';
import { ProjectPanel } from './ProjectPanel';
import { ResetConfirmModal } from './ResetConfirmModal';
import { CONSULTANT_SYSTEM_INSTRUCTION } from './prompts';
import type { ProjectMeta } from '@/services/projectApi';


// Ref interface for external access
export interface ControlPanelRef {
  handleInspectEdit: (prompt: string, element: InspectedElement, scope: EditScope) => Promise<void>;
  sendErrorToChat: (errorMessage: string) => void;
}

interface GitStatus {
  initialized: boolean;
  branch?: string;
  clean?: boolean;
}

interface ControlPanelProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;
  setSuggestions: (suggestions: string[] | null) => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
  resetApp: () => void;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onOpenAISettings?: () => void;
  onOpenMegaSettings?: () => void;
  onOpenCodeMap?: () => void;
  autoAcceptChanges?: boolean;
  onAutoAcceptChangesChange?: (value: boolean) => void;
  // Diff Mode (Beta)
  diffModeEnabled?: boolean;
  onDiffModeChange?: (value: boolean) => void;
  // Project props
  currentProject?: ProjectMeta | null;
  projects?: ProjectMeta[];
  isServerOnline?: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: number | null;
  isLoadingProjects?: boolean;
  onCreateProject?: (name?: string, description?: string) => Promise<ProjectMeta | null>;
  onOpenProject?: (id: string) => Promise<boolean>;
  onDeleteProject?: (id: string) => Promise<boolean>;
  onDuplicateProject?: (id: string) => Promise<ProjectMeta | null>;
  onRefreshProjects?: () => Promise<void>;
  onCloseProject?: () => void;
  // Git status props for ProjectPanel
  gitStatus?: GitStatus | null;
  hasUncommittedChanges?: boolean;
  onOpenGitTab?: () => void;
  // History Timeline checkpoint
  onSaveCheckpoint?: (name: string) => void;
}

export const ControlPanel = forwardRef<ControlPanelRef, ControlPanelProps>(({
  files,
  setFiles,
  setSuggestions,
  isGenerating,
  setIsGenerating,
  resetApp,
  reviewChange,
  selectedModel,
  onModelChange,
  onOpenAISettings,
  onOpenMegaSettings,
  onOpenCodeMap,
  autoAcceptChanges,
  onAutoAcceptChangesChange,
  diffModeEnabled,
  onDiffModeChange,
  // Project props
  currentProject,
  projects = [],
  isServerOnline = false,
  isSyncing = false,
  lastSyncedAt,
  isLoadingProjects = false,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefreshProjects,
  onCloseProject,
  // Git status props
  gitStatus,
  hasUncommittedChanges,
  onOpenGitTab,
  // History Timeline checkpoint
  onSaveCheckpoint
}, ref) => {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConsultantMode, setIsConsultantMode] = useState(false);
  const [isEducationMode, setIsEducationMode] = useState(false);
  const [, forceUpdate] = useState({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);
  const [showCodebaseSync, setShowCodebaseSync] = useState(false);

  // Modal exclusivity state
  const [openModal, setOpenModal] = useState<'settings' | 'projects' | 'techstack' | 'promptengineer' | 'batchgen' | null>(null);

  // Batch generation modal state
  const [batchGenModal, setBatchGenModal] = useState<{
    isOpen: boolean;
    prompt: string;
    systemInstruction: string;
    targetFiles: string[];
  } | null>(null);

  // Generation state (streaming, file plan, truncation, continuation)
  const genState = useGenerationState();
  const {
    streamingStatus, setStreamingStatus,
    streamingChars, setStreamingChars,
    streamingFiles, setStreamingFiles,
    filePlan, setFilePlan,
    truncatedContent, setTruncatedContent,
    continuationState, setContinuationState,
    externalPrompt, setExternalPrompt
  } = genState;

  // Tech stack configuration (must be before hooks that use generateSystemInstruction)
  const { generateSystemInstruction } = useTechStack();

  // Continuation generation hook (handles multi-batch, retries, missing files)
  const {
    handleContinueGeneration,
    requestMissingFiles,
    handleTruncationRetry: hookTruncationRetry
  } = useContinuationGeneration({
    files,
    selectedModel,
    setIsGenerating,
    setStreamingStatus,
    setStreamingChars,
    setFilePlan,
    setContinuationState,
    setTruncatedContent,
    setMessages,
    reviewChange,
  });

  // Inspect edit hook (handles element-scoped editing)
  const { handleInspectEditRequest } = useInspectEdit({
    files,
    selectedModel,
    generateSystemInstruction,
    setStreamingStatus,
    setIsGenerating,
    setMessages,
    reviewChange,
  });

  // AI History - persists across refreshes (declared early for use in useCodeGeneration)
  const aiHistory = useAIHistory(currentProject?.id || null);

  // Code generation hook (handles main generation logic)
  const { generateCode } = useCodeGeneration({
    files,
    selectedModel,
    generateSystemInstruction,
    setStreamingStatus,
    setStreamingChars,
    setStreamingFiles,
    setFilePlan,
    setContinuationState,
    setTruncatedContent,
    setIsGenerating,
    setMessages,
    reviewChange,
    handleContinueGeneration,
    addAIHistoryEntry: aiHistory.addEntry,
  });

  // Context management
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`);
  // Track which messages have been synced to context manager (prevents duplicates on batch updates)
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());

  // Update session ID when project changes
  useEffect(() => {
    sessionIdRef.current = `${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`;
    // Clear synced message IDs when project changes (different projects have different contexts)
    syncedMessageIdsRef.current.clear();
    console.log(`[ContextSync] Project changed, new session: ${sessionIdRef.current}`);
  }, [currentProject?.id]);

  // Modal exclusivity handlers
  const handleModalOpen = (modalType: 'settings' | 'projects') => {
    setOpenModal(modalType);
  };

  const handleModalClose = (modalType: 'settings' | 'projects' | 'techstack' | 'promptengineer') => {
    setOpenModal(prev => prev === modalType ? null : prev);
  };

  // Sync messages with context manager
  // BUG FIX: Sync ALL new messages, not just the last one
  // React 18 batches state updates, so multiple messages can be added before this runs
  useEffect(() => {
    if (messages.length === 0) return;

    // Find all messages that haven't been synced yet
    const unsynced = messages.filter(msg => !syncedMessageIdsRef.current.has(msg.id));
    if (unsynced.length === 0) return;

    console.log(`[ContextSync] Found ${unsynced.length} unsync'd message(s) to add`);

    for (const msg of unsynced) {
      // For user messages: use llmContent (full codebase) or prompt
      // For assistant messages: use explanation/error + file content for accurate token counting
      let content: string;
      let actualTokens: number | undefined;

      if (msg.role === 'user') {
        content = msg.llmContent || msg.prompt || '';
        // Use actual token count if available (e.g., from codebase sync)
        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      } else {
        // For assistant messages, include file content in token estimation
        const textContent = msg.explanation || msg.error || '';
        const filesContent = msg.files
          ? Object.entries(msg.files).map(([path, code]) => `// ${path}\n${code}`).join('\n\n')
          : '';
        content = textContent + (filesContent ? '\n\n' + filesContent : '');

        // Use actual token count from API if available
        if (msg.tokenUsage?.totalTokens) {
          actualTokens = msg.tokenUsage.totalTokens;
        }
      }

      console.log(`[ContextSync] Adding ${msg.role} message (id: ${msg.id.slice(0, 8)}...) to session "${sessionIdRef.current}", content length: ${content.length}, tokens: ${actualTokens || 'estimated'}`);

      contextManager.addMessage(
        sessionIdRef.current,
        msg.role,
        content,
        { messageId: msg.id },
        actualTokens
      );

      // Mark as synced
      syncedMessageIdsRef.current.add(msg.id);
    }
    // Note: contextManager is a singleton, messages array is iterated but we only trigger on length change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const existingApp = files['src/App.tsx'];

  // Handle context compaction
  const handleCompaction = useCallback(async () => {
    const manager = getProviderManager();
    const config = getFluidFlowConfig();

    await contextManager.compactContext(sessionIdRef.current, async (text) => {
      const request: GenerationRequest = {
        prompt: `Summarize this conversation concisely, preserving key decisions, code changes, and context:\n\n${text}`,
        systemInstruction: 'You are a conversation summarizer. Create a brief but complete summary that captures the essential context, decisions made, and any code or technical details discussed.',
        responseFormat: 'text'
      };
      const response = await manager.generate(request);

      // Log compaction
      const context = contextManager.getContext(sessionIdRef.current);
      config.addCompactionLog({
        contextId: sessionIdRef.current,
        beforeTokens: context.estimatedTokens * 2,
        afterTokens: context.estimatedTokens,
        messagesSummarized: messages.length - 2,
        summary: response.text || 'Conversation compacted'
      });

      return response.text || '';
    });
    // Note: contextManager is a singleton that doesn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Handle provider changes from settings
  const handleProviderChange = useCallback((providerId: string, modelId: string) => {
    // Force re-render to update the active provider display
    forceUpdate({});
    // Model change handled through the provider's defaultModel
    onModelChange(modelId);
  }, [onModelChange]);

  // Handle prompt generated from PromptEngineerModal
  const handlePromptGenerated = useCallback((prompt: string) => {
    // Auto-fill the chat input with the generated prompt
    const inputElement = document.querySelector('textarea[placeholder*="Type your prompt"]') as HTMLTextAreaElement;
    if (inputElement) {
      inputElement.value = prompt;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, []);

  // Handle truncation retry - wrapper for hook function
  const handleTruncationRetry = async () => {
    if (!truncatedContent) return;
    await hookTruncationRetry(truncatedContent, reviewChange);
  };

  // handleSend is intentionally not wrapped in useCallback - it has many dependencies
  // and the complexity of tracking them all outweighs the re-render cost
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSend = async (prompt: string, attachments: ChatAttachment[], _fileContext?: string[], inspectContext?: InspectContext) => {
    // Track if continuation was started (to prevent finally block from clearing isGenerating)
    let continuationStarted = false;

    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      timestamp: Date.now(),
      prompt: prompt || (attachments.length > 0 ? 'Generate from uploaded sketch' : ''),
      attachments: attachments.length > 0 ? attachments : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setSuggestions(null);

    // Get attachments
    const sketchAtt = attachments.find(a => a.type === 'sketch');
    const brandAtt = attachments.find(a => a.type === 'brand');

    try {
      const manager = getProviderManager();
      const activeProvider = manager.getActiveConfig();
      const currentModel = activeProvider?.defaultModel || selectedModel;
      const providerName = activeProvider?.name || 'AI';

      if (inspectContext) {
        // INSPECT EDIT MODE - Delegated to useInspectEdit hook
        await handleInspectEditRequest(prompt, inspectContext);
        return;

      } else if (isConsultantMode) {
        // Consultant mode - return suggestions
        const systemInstruction = CONSULTANT_SYSTEM_INSTRUCTION;

        const images: { data: string; mimeType: string }[] = [];
        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          images.push({ data: base64Data, mimeType: sketchAtt.file.type });
        }

        const request: GenerationRequest = {
          prompt: prompt ? `Analyze this design. Context: ${prompt}` : 'Analyze this design for UX gaps.',
          systemInstruction,
          images,
          responseFormat: 'json',
          responseSchema: SUGGESTIONS_SCHEMA
        };

        const requestId = debugLog.request('generation', {
          model: currentModel,
          prompt: request.prompt,
          systemInstruction,
          attachments: attachments.map(a => ({ type: a.type, size: a.file.size })),
          metadata: { mode: 'consultant', provider: providerName }
        });
        const startTime = Date.now();

        const response = await manager.generate(request, currentModel);
        const text = response.text || '[]';
        const duration = Date.now() - startTime;

        debugLog.response('generation', {
          id: requestId,
          model: currentModel,
          duration,
          response: text,
          metadata: { mode: 'consultant', provider: providerName }
        });
        try {
          const suggestionsData = JSON.parse(text);
          setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : ['Could not parse suggestions.']);

          // Add assistant message with token usage
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: `## UX Analysis Complete\n\nI found **${Array.isArray(suggestionsData) ? suggestionsData.length : 0} suggestions** to improve your design. Check the suggestions panel on the right.`,
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName,
            generationTime: duration,
            tokenUsage: response.usage ? {
              inputTokens: response.usage.inputTokens || 0,
              outputTokens: response.usage.outputTokens || 0,
              totalTokens: (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0)
            } : undefined
          };
          setMessages(prev => [...prev, assistantMessage]);
        } catch {
          setSuggestions(['Error parsing consultant suggestions.']);
        }
      } else {
        // Generate/Update app mode - Delegated to useCodeGeneration hook
        const conversationHistory = contextManager.getMessagesForAI(sessionIdRef.current);
        console.log(`[handleSend] Session: ${sessionIdRef.current}, History messages: ${conversationHistory.length}`);
        if (conversationHistory.length > 0) {
          const totalHistoryChars = conversationHistory.reduce((sum, m) => sum + m.content.length, 0);
          console.log(`[handleSend] History total chars: ${totalHistoryChars}, estimated tokens: ~${Math.ceil(totalHistoryChars / 4)}`);
        }

        const result = await generateCode({
          prompt,
          attachments,
          isEducationMode,
          diffModeEnabled,
          conversationHistory,
        });

        continuationStarted = result.continuationStarted || false;

        // Exit early - hook handles all success/error states internally
        return;
      }
    } catch (error) {
      console.error('Error generating content:', error);

      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      debugLog.error('generation', error instanceof Error ? error.message : 'Unknown error', {
        model: activeConfig?.defaultModel || selectedModel,
        metadata: { mode: isConsultantMode ? 'consultant' : 'generator', provider: activeConfig?.name }
      });

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        snapshotFiles: { ...files }
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      // Only clear generating state if continuation was NOT started
      // (continuation handles its own state management)
      if (!continuationStarted) {
        setIsGenerating(false);
        // Clear streaming status after a delay so user sees final status
        setTimeout(() => {
          setStreamingStatus('');
          setStreamingChars(0);
        }, 2000);
      }
    }
  };

  const handleRevert = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.snapshotFiles) {
      reviewChange(`Revert to earlier state`, message.snapshotFiles);
    }
  };

  const handleRetry = (errorMessageId: string) => {
    // Find the error message and the user message before it
    const errorIndex = messages.findIndex(m => m.id === errorMessageId);
    if (errorIndex < 1) return;

    const userMessage = messages[errorIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the error message and user message from chat
    setMessages(prev => prev.filter((_, i) => i !== errorIndex && i !== errorIndex - 1));

    // Re-send the request
    handleSend(
      userMessage.prompt || '',
      userMessage.attachments || []
    );
  };

  // Handle inspect edit from PreviewPanel - with strict scope enforcement
  const handleInspectEdit = useCallback(async (prompt: string, element: InspectedElement, scope: EditScope) => {
    console.log('[ControlPanel.handleInspectEdit] Called with:', { prompt, element, scope });
    // Use handleSend with inspectContext for strict scope enforcement
    await handleSend(prompt, [], undefined, { element, scope });
  }, [handleSend]);

  // Send error to chat - called from PreviewPanel when auto-fix fails
  const sendErrorToChat = useCallback((errorMessage: string) => {
    const errorPrompt = `🚨 **Runtime Error - Auto-fix Failed**

The following error occurred and auto-fix could not resolve it:

\`\`\`
${errorMessage}
\`\`\`

Please analyze this error and fix the code. Focus on:
1. Understanding what caused the error
2. Identifying the exact location in the code
3. Providing a working fix

Fix the error in src/App.tsx.`;

    // Send to chat using normal flow
    handleSend(errorPrompt, []);
  }, [handleSend]);


  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    handleInspectEdit,
    sendErrorToChat
  }), [handleInspectEdit, sendErrorToChat]);

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    setMessages([]);
    contextManager.clearContext(sessionIdRef.current);
    resetApp();
    setShowResetConfirm(false);
  };

  return (
    <aside className="w-full md:w-[30%] md:min-w-[360px] md:max-w-[440px] h-full self-stretch min-h-0 flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden relative z-20 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-white/5">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-slate-300">
              FluidFlow
            </h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">AI APP BUILDER</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenMegaSettings}
            className="p-2 hover:bg-blue-500/10 rounded-lg text-slate-500 hover:text-blue-400 transition-colors"
            title="Settings (Ctrl+,)"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetClick}
            className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
            title="Start Fresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AI Provider Quick Selector */}
      <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Model Selector Dropdown */}
          <div className="flex-1 relative">
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full appearance-none bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 cursor-pointer hover:bg-slate-800/70 transition-colors"
            >
              {(() => {
                const manager = getProviderManager();
                const activeConfig = manager.getActiveConfig();
                if (!activeConfig?.models?.length) {
                  return <option value={selectedModel}>{selectedModel || 'No models'}</option>;
                }
                return activeConfig.models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ));
              })()}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>

          {/* Provider Badge & Settings Button */}
          <button
            onClick={onOpenAISettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            title="AI Provider Settings"
          >
            <span className="text-blue-400">
              {(() => {
                const manager = getProviderManager();
                const activeConfig = manager.getActiveConfig();
                return activeConfig?.name?.split(' ')[0] || 'AI';
              })()}
            </span>
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Context Indicator */}
      <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
        <ContextIndicator
          contextId={sessionIdRef.current}
          showLabel={true}
          onCompact={handleCompaction}
          className="w-full"
        />
      </div>

      {/* Chat Messages */}
      <ChatPanel
        messages={messages}
        onRevert={handleRevert}
        onRetry={handleRetry}
        isGenerating={isGenerating}
        streamingStatus={streamingStatus}
        streamingChars={streamingChars}
        streamingFiles={streamingFiles}
        aiHistoryCount={aiHistory.history.filter(h => h.success).length}
        truncatedContent={truncatedContent}
        onTruncationRetry={handleTruncationRetry}
        onBatchGeneration={(incompleteFiles, prompt, systemInstruction) => {
          setBatchGenModal({
            isOpen: true,
            prompt,
            systemInstruction,
            targetFiles: incompleteFiles
          });
        }}
        onSetExternalPrompt={setExternalPrompt}
        continuationState={continuationState}
        onContinueGeneration={() => handleContinueGeneration()}
        filePlan={filePlan}
        onSaveCheckpoint={() => {
          // Check if there are files to checkpoint
          if (Object.keys(files).length === 0) {
            const errorMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              explanation: '⚠️ **No files to checkpoint.** Generate some code first before saving a checkpoint.',
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
            return;
          }

          // Save to History Timeline using the prop callback
          if (onSaveCheckpoint) {
            const checkpointName = `Checkpoint (${Object.keys(files).length} files)`;
            onSaveCheckpoint(checkpointName);

            // Show success feedback
            const successMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              explanation: `✅ **Checkpoint saved!** Saved ${Object.keys(files).length} files. You can restore this checkpoint from the History Timeline (Ctrl+Shift+H).`,
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, successMessage]);
          } else {
            const errorMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              explanation: '⚠️ **Checkpoint not available.** History Timeline is not connected.',
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
          }
        }}
        onRestoreFromHistory={() => {
          // Restore the most recent successful entry directly
          const lastEntry = aiHistory.history.find(h => h.success);
          if (!lastEntry) return;

          try {
            // Find all history entries up to and including this one (by timestamp)
            const entriesToRestore = aiHistory.history
              .filter(h => h.timestamp <= lastEntry.timestamp && h.success)
              .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

            // Reconstruct ALL chat messages from history
            const restoredMessages: ChatMessage[] = [];
            let previousFiles: FileSystem = {};

            for (const historyEntry of entriesToRestore) {
              // Parse files from this entry
              const parsed = parseMultiFileResponse(historyEntry.rawResponse);
              if (!parsed?.files) continue;

              // Clean the generated code
              const cleanedFiles: FileSystem = {};
              for (const [path, content] of Object.entries(parsed.files)) {
                cleanedFiles[path] = cleanGeneratedCode(content);
              }

              // Calculate file changes with support for deleted files
              let mergedFiles: Record<string, string>;
              if (Object.keys(previousFiles).length > 0) {
                // Start with previous files and apply updates
                mergedFiles = { ...previousFiles };

                // Apply new/modified files
                Object.assign(mergedFiles, cleanedFiles);

                // Remove deleted files (if any)
                const deletedFiles = parsed.deletedFiles || [];
                for (const deletedPath of deletedFiles) {
                  delete mergedFiles[deletedPath];
                }
              } else {
                // First entry - just use generated files
                mergedFiles = cleanedFiles;
              }

              const fileChanges = calculateFileChanges(previousFiles, mergedFiles);

              // User message
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'user',
                timestamp: historyEntry.timestamp - 1000,
                prompt: historyEntry.prompt,
                attachments: historyEntry.hasSketch || historyEntry.hasBrand ? [
                  ...(historyEntry.hasSketch ? [{ type: 'sketch' as const, preview: '', file: new File([], 'sketch.png') }] : []),
                  ...(historyEntry.hasBrand ? [{ type: 'brand' as const, preview: '', file: new File([], 'brand.png') }] : [])
                ] : undefined
              });

              // Assistant message with file changes
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: historyEntry.timestamp,
                files: cleanedFiles,
                explanation: parsed.explanation || historyEntry.explanation || '',
                fileChanges,
                snapshotFiles: cleanedFiles
              });

              // Track files for next iteration
              previousFiles = mergedFiles;
            }

            if (Object.keys(previousFiles).length > 0) {
              setMessages(restoredMessages);
              setFiles(previousFiles);
            }
          } catch (error) {
            console.error('[ControlPanel] Failed to restore from history:', error);
          }
        }}
      />

      {/* Mode Toggle + Auto-Accept */}
      <div className="px-3 py-2 border-t border-white/5 flex-shrink-0 flex items-center justify-between gap-2">
        <ModeToggle
          isConsultantMode={isConsultantMode}
          onToggle={() => setIsConsultantMode(!isConsultantMode)}
          autoAcceptChanges={autoAcceptChanges}
          onAutoAcceptChange={onAutoAcceptChangesChange}
        />
        {/* Sync Codebase Button */}
        {Object.keys(files).length > 0 && (
          <button
            onClick={() => setShowCodebaseSync(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all"
            title="Sync current codebase to AI context"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Sync to AI</span>
          </button>
        )}
      </div>

      {/* Chat Input */}
      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        hasExistingApp={!!existingApp}
        placeholder={isConsultantMode ? "Describe what to analyze..." : undefined}
        files={files}
        onOpenPromptEngineer={() => setOpenModal('promptengineer')}
        externalPrompt={externalPrompt}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isEducationMode={isEducationMode}
        onEducationModeChange={setIsEducationMode}
        hasApiKey={(() => {
          const manager = getProviderManager();
          const config = manager.getActiveConfig();
          return !!(config?.apiKey || config?.isLocal);
        })()}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        onProviderChange={handleProviderChange}
        onOpenAISettings={onOpenAISettings}
        onOpenMegaSettings={onOpenMegaSettings}
        onOpenCodeMap={onOpenCodeMap}
        onOpenTechStack={() => setOpenModal('techstack')}
        aiHistoryCount={aiHistory.history.length}
        onOpenAIHistory={() => setShowAIHistory(true)}
        autoAcceptChanges={autoAcceptChanges}
        onAutoAcceptChangesChange={onAutoAcceptChangesChange}
        diffModeEnabled={diffModeEnabled}
        onDiffModeChange={onDiffModeChange}
        shouldClose={openModal === 'projects' || openModal === 'techstack'}
        onClosed={() => handleModalClose('settings')}
        onOpened={() => handleModalOpen('settings')}
      />

      {/* Project Panel */}
      {onCreateProject && onOpenProject && onDeleteProject && onDuplicateProject && onRefreshProjects && onCloseProject && (
        <ProjectPanel
          currentProject={currentProject || null}
          projects={projects}
          isServerOnline={isServerOnline}
          isSyncing={isSyncing}
          lastSyncedAt={lastSyncedAt || null}
          isLoadingProjects={isLoadingProjects}
          onCreateProject={onCreateProject}
          onOpenProject={onOpenProject}
          onDeleteProject={onDeleteProject}
          onDuplicateProject={onDuplicateProject}
          onRefreshProjects={onRefreshProjects}
          onCloseProject={onCloseProject}
          gitStatus={gitStatus}
          hasUncommittedChanges={hasUncommittedChanges}
          onOpenGitTab={onOpenGitTab}
          // Unsaved work props - only show if more files than default template (9 files)
          // or if files have been modified (we check count as a simple proxy)
          hasUnsavedWork={!currentProject && Object.keys(files).length > 9}
          fileCount={Object.keys(files).length}
          onSaveCurrentAsProject={async (name, description) => {
            // Create new project with current files
            // onCreateProject captures 'files' from App.tsx scope
            const newProject = await onCreateProject?.(name, description);
            return newProject || null;
          }}
          shouldClose={openModal === 'settings'}
          onClosed={() => handleModalClose('projects')}
          onOpened={() => handleModalOpen('projects')}
        />
      )}

      {/* Reset Confirmation Modal */}
      <ResetConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmReset}
        currentProjectName={currentProject?.name}
        hasUncommittedChanges={hasUncommittedChanges}
        onOpenGitTab={onOpenGitTab}
      />

      {/* AI History Modal */}
      <AIHistoryModal
        isOpen={showAIHistory}
        onClose={() => setShowAIHistory(false)}
        history={aiHistory.history}
        onClearHistory={aiHistory.clearHistory}
        onDeleteEntry={aiHistory.deleteEntry}
        onExportHistory={aiHistory.exportHistory}
        onRestoreEntry={async (entry) => {
          try {
            // Find all history entries up to and including this one (by timestamp)
            const entriesToRestore = aiHistory.history
              .filter(h => h.timestamp <= entry.timestamp && h.success)
              .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

            // Reconstruct ALL chat messages from history
            const restoredMessages: ChatMessage[] = [];
            let previousFiles: FileSystem = {};

            for (const historyEntry of entriesToRestore) {
              // Parse files from this entry
              const parsed = parseMultiFileResponse(historyEntry.rawResponse);
              if (!parsed?.files) continue;

              // Clean the generated code
              const cleanedFiles: FileSystem = {};
              for (const [path, content] of Object.entries(parsed.files)) {
                cleanedFiles[path] = cleanGeneratedCode(content);
              }

              // Calculate file changes with support for deleted files
              let mergedFiles: Record<string, string>;
              if (Object.keys(previousFiles).length > 0) {
                // Start with previous files and apply updates
                mergedFiles = { ...previousFiles };

                // Apply new/modified files
                Object.assign(mergedFiles, cleanedFiles);

                // Remove deleted files (if any)
                const deletedFiles = parsed.deletedFiles || [];
                for (const deletedPath of deletedFiles) {
                  delete mergedFiles[deletedPath];
                }
              } else {
                // First entry - just use generated files
                mergedFiles = cleanedFiles;
              }

              const fileChanges = calculateFileChanges(previousFiles, mergedFiles);

              // User message
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'user',
                timestamp: historyEntry.timestamp - 1000,
                prompt: historyEntry.prompt,
                attachments: historyEntry.hasSketch || historyEntry.hasBrand ? [
                  ...(historyEntry.hasSketch ? [{ type: 'sketch' as const, preview: '', file: new File([], 'sketch.png') }] : []),
                  ...(historyEntry.hasBrand ? [{ type: 'brand' as const, preview: '', file: new File([], 'brand.png') }] : [])
                ] : undefined
              });

              // Assistant message with file changes
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: historyEntry.timestamp,
                files: cleanedFiles,
                explanation: parsed.explanation || historyEntry.explanation || '',
                fileChanges,
                snapshotFiles: cleanedFiles
              });

              // Track files for next iteration
              previousFiles = mergedFiles;
            }

            if (Object.keys(previousFiles).length === 0) {
              console.error('[ControlPanel] No files found in history entries');
              return false;
            }

            // Restore messages and files directly (no diff modal)
            setMessages(restoredMessages);
            setFiles(previousFiles);

            return true;
          } catch (error) {
            console.error('[ControlPanel] Failed to restore from history:', error);
            return false;
          }
        }}
      />

      {/* Tech Stack Modal */}
      <TechStackModal
        isOpen={openModal === 'techstack'}
        onClose={() => handleModalClose('techstack')}
      />

      {/* Prompt Engineer Modal */}
      <PromptEngineerModal
        isOpen={openModal === 'promptengineer'}
        onClose={() => handleModalClose('promptengineer')}
        onPromptGenerated={handlePromptGenerated}
      />

      {/* Batch Generation Modal */}
      {batchGenModal && (
        <BatchGenerationModal
          isOpen={batchGenModal.isOpen}
          onClose={() => setBatchGenModal(null)}
          prompt={batchGenModal.prompt}
          systemInstruction={batchGenModal.systemInstruction}
          targetFiles={batchGenModal.targetFiles}
          onComplete={(generatedFiles: FileSystem) => {
            // Apply the generated files to the current project
            const fileChanges: FileChange[] = Object.entries(generatedFiles).map(([path, content]) => ({
              path,
              type: files[path] ? 'modified' : 'added',
              additions: content.split('\n').length,
              deletions: files[path] ? files[path].split('\n').length : 0
            }));

            // Create file list for display
            const _generatedFileList = Object.keys(generatedFiles);

            // Create a message for the batch generation completion
            const batchMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              timestamp: Date.now(),
              explanation: `✅ Successfully generated ${Object.keys(generatedFiles).length} files in batches.`,
              files: generatedFiles,
              fileChanges,
              snapshotFiles: { ...files }
            };

            setMessages(prev => [...prev, batchMessage]);

            // Show in diff modal (or auto-apply if auto-accept is on)
            reviewChange('Batch Generated Files', { ...files, ...generatedFiles });
            setBatchGenModal(null);
          }}
        />
      )}

      {/* Codebase Sync Modal */}
      <CodebaseSyncModal
        isOpen={showCodebaseSync}
        onClose={() => setShowCodebaseSync(false)}
        files={files}
        onSync={async (payload) => {
          const { displayMessage, llmMessage, fileCount, tokenEstimate, batchIndex, totalBatches } = payload;

          // Debug log - request
          console.log(`[CodebaseSync] Batch ${batchIndex + 1}/${totalBatches}`, {
            fileCount,
            tokenEstimate,
            displayMessageLength: displayMessage.length,
            llmMessageLength: llmMessage.length
          });
          debugLog.request('other', {
            model: 'codebase-sync',
            prompt: `Sync batch ${batchIndex + 1}/${totalBatches}: ${fileCount} files, ~${tokenEstimate} tokens`,
            metadata: { fileCount, tokenEstimate, batchIndex, totalBatches }
          });

          // Create message for chat UI (short display) but with full LLM content
          const syncMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            timestamp: Date.now(),
            prompt: displayMessage,
            // Store full content for LLM in a separate field
            llmContent: llmMessage,
            // Track precise token count from sync calculation
            tokenUsage: {
              inputTokens: tokenEstimate,
              outputTokens: 0,
              totalTokens: tokenEstimate,
              isEstimated: false // This is calculated precisely from file sizes
            }
          };
          setMessages(prev => [...prev, syncMessage]);

          // If this is the last batch, add an AI acknowledgment
          if (batchIndex === totalBatches - 1) {
            const totalFiles = Object.keys(files).length;
            const ackExplanation = `✅ **Codebase synced successfully!**\n\nI now have the complete and up-to-date view of your project (${totalFiles} files). I'll use this as the reference for all future requests.\n\nFeel free to ask me to make changes or improvements!`;
            const ackTokens = estimateTokenCount(ackExplanation);
            const ackMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              timestamp: Date.now(),
              explanation: ackExplanation,
              tokenUsage: {
                inputTokens: 0,
                outputTokens: ackTokens,
                totalTokens: ackTokens,
                isEstimated: true
              }
            };
            setMessages(prev => [...prev, ackMessage]);

            // Debug log - complete
            console.log('[CodebaseSync] Sync complete', { totalFiles, totalBatches });
            debugLog.response('other', {
              id: 'codebase-sync-complete',
              model: 'codebase-sync',
              duration: 0,
              response: `Synced ${totalFiles} files in ${totalBatches} batch(es)`
            });
          }
        }}
      />
    </aside>
  );
});

ControlPanel.displayName = 'ControlPanel';
