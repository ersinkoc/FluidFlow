/**
 * useChatOrchestrator - Centralized chat business logic
 *
 * Handles all chat-related operations:
 * - Message sending (handleSend)
 * - Message retry/revert
 * - Inspect edit requests
 * - Error forwarding to chat
 * - Context management
 */

import { useState, useCallback } from 'react';
import { ChatMessage, ChatAttachment, FileSystem } from '../../../types';
import { debugLog } from '../../../hooks/useDebugStore';
import { useTechStack } from '../../../hooks/useTechStack';
import { useGenerationState } from '../../../hooks/useGenerationState';
import { useContinuationGeneration } from '../../../hooks/useContinuationGeneration';
import { useInspectEdit, InspectContext } from '../../../hooks/useInspectEdit';
import { useCodeGeneration } from '../../../hooks/useCodeGeneration';
import { useContextSync } from './useContextSync';
import { useAIHistory } from '../../../hooks/useAIHistory';
import { getProviderManager, GenerationRequest } from '../../../services/ai';
import { getFluidFlowConfig } from '../../../services/fluidflowConfig';
import { ensureTokenSpace } from '../../../services/contextCompaction';
import { executeConsultantMode } from '../utils/consultantMode';
import { InspectedElement, EditScope } from '../../PreviewPanel/ComponentInspector';

interface UseChatOrchestratorProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  selectedModel: string;
  projectId: string | null;
  setIsGenerating: (generating: boolean) => void;
  setSuggestions: (suggestions: string[] | null) => void;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  isConsultantMode: boolean;
  isEducationMode: boolean;
  diffModeEnabled?: boolean;
}

export function useChatOrchestrator({
  files,
  setFiles: _setFiles,
  selectedModel,
  projectId,
  setIsGenerating,
  setSuggestions,
  reviewChange,
  isConsultantMode,
  isEducationMode,
  diffModeEnabled,
}: UseChatOrchestratorProps) {
  // Chat messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Generation state (streaming, file plan, truncation, continuation)
  const genState = useGenerationState();
  const {
    streamingStatus, setStreamingStatus,
    streamingChars, setStreamingChars,
    streamingFiles, setStreamingFiles,
    fileProgress,
    setFileProgress,
    updateFileProgress,
    initFileProgressFromPlan,
    filePlan, setFilePlan,
    truncatedContent, setTruncatedContent,
    continuationState, setContinuationState,
    externalPrompt, setExternalPrompt
  } = genState;

  // Tech stack configuration
  const { generateSystemInstruction } = useTechStack();

  // Continuation generation hook
  const {
    handleContinueGeneration,
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

  // Inspect edit hook
  const { handleInspectEditRequest } = useInspectEdit({
    files,
    selectedModel,
    generateSystemInstruction,
    setStreamingStatus,
    setIsGenerating,
    setMessages,
    reviewChange,
  });

  // AI History
  const aiHistory = useAIHistory(projectId);

  // Code generation hook
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
    updateFileProgress,
    initFileProgressFromPlan,
    setFileProgress,
  });

  // Context management
  const { sessionId, contextManager } = useContextSync({
    projectId,
    messages,
  });

  // Handle context compaction
  const handleCompaction = useCallback(async () => {
    const manager = getProviderManager();
    const config = getFluidFlowConfig();

    await contextManager.compactContext(sessionId, async (text) => {
      const request: GenerationRequest = {
        prompt: `Summarize this conversation concisely, preserving key decisions, code changes, and context:\n\n${text}`,
        systemInstruction: 'You are a conversation summarizer. Create a brief but complete summary that captures the essential context, decisions made, and any code or technical details discussed.',
        responseFormat: 'text'
      };
      const response = await manager.generate(request);

      // Log compaction
      const context = contextManager.getContext(sessionId);
      config.addCompactionLog({
        contextId: sessionId,
        beforeTokens: context.estimatedTokens * 2,
        afterTokens: context.estimatedTokens,
        messagesSummarized: messages.length - 2,
        summary: response.text || 'Conversation compacted'
      });

      return response.text || '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages.length]);

  // Handle truncation retry
  const handleTruncationRetry = useCallback(async () => {
    if (!truncatedContent) return;
    await hookTruncationRetry(truncatedContent, reviewChange);
  }, [truncatedContent, hookTruncationRetry, reviewChange]);

  // Main send handler
  const handleSend = useCallback(async (
    prompt: string,
    attachments: ChatAttachment[],
    _fileContext?: string[],
    inspectContext?: InspectContext
  ) => {
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

    // Check token space before processing
    const estimatedTokens = Math.ceil((prompt?.length || 0) / 4) + 500; // Rough estimate
    const spaceCheck = await ensureTokenSpace(sessionId, estimatedTokens);

    if (!spaceCheck.canProceed) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        error: spaceCheck.reason || 'Insufficient token space. Please compact the context.',
      }]);
      setIsGenerating(false);
      return;
    }

    if (spaceCheck.compacted) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        content: `📦 Context auto-compacted to make space for your request.`,
      }]);
    }

    try {
      if (inspectContext) {
        // INSPECT EDIT MODE
        await handleInspectEditRequest(prompt, inspectContext);
        return;

      } else if (isConsultantMode) {
        // Consultant mode
        const result = await executeConsultantMode({
          prompt,
          attachments,
          files,
          selectedModel,
        });
        setSuggestions(result.suggestions);
        setMessages(prev => [...prev, result.message]);
      } else {
        // Generate/Update app mode
        const conversationHistory = contextManager.getMessagesForAI(sessionId);
        console.log(`[handleSend] Session: ${sessionId}, History messages: ${conversationHistory.length}`);

        const result = await generateCode({
          prompt,
          attachments,
          isEducationMode,
          diffModeEnabled,
          conversationHistory,
        });

        continuationStarted = result.continuationStarted || false;
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
      if (!continuationStarted) {
        setIsGenerating(false);
        setTimeout(() => {
          setStreamingStatus('');
          setStreamingChars(0);
        }, 2000);
      }
    }
  }, [
    files,
    selectedModel,
    isConsultantMode,
    isEducationMode,
    diffModeEnabled,
    sessionId,
    contextManager,
    setIsGenerating,
    setSuggestions,
    handleInspectEditRequest,
    generateCode,
    setStreamingStatus,
    setStreamingChars
  ]);

  // Handle message revert
  const handleRevert = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.snapshotFiles) {
      reviewChange(`Revert to earlier state`, message.snapshotFiles);
    }
  }, [messages, reviewChange]);

  // Handle message retry
  const handleRetry = useCallback((errorMessageId: string) => {
    const errorIndex = messages.findIndex(m => m.id === errorMessageId);
    if (errorIndex < 1) return;

    const userMessage = messages[errorIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove error and user message
    setMessages(prev => prev.filter((_, i) => i !== errorIndex && i !== errorIndex - 1));

    // Re-send
    handleSend(
      userMessage.prompt || '',
      userMessage.attachments || []
    );
  }, [messages, handleSend]);

  // Handle inspect edit from PreviewPanel
  const handleInspectEdit = useCallback(async (prompt: string, element: InspectedElement, scope: EditScope) => {
    console.log('[useChatOrchestrator.handleInspectEdit] Called with:', { prompt, element, scope });
    await handleSend(prompt, [], undefined, { element, scope });
  }, [handleSend]);

  // Send error to chat (from PreviewPanel auto-fix failures)
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

    handleSend(errorPrompt, []);
  }, [handleSend]);

  // Clear messages and context
  const clearChat = useCallback(() => {
    setMessages([]);
    contextManager.clearContext(sessionId);
  }, [sessionId, contextManager]);

  return {
    // State
    messages,
    setMessages,
    sessionId,
    contextManager,

    // Generation state
    streamingStatus,
    streamingChars,
    streamingFiles,
    fileProgress,
    filePlan,
    truncatedContent,
    continuationState,
    externalPrompt,
    setExternalPrompt,

    // AI History
    aiHistory,

    // Actions
    handleSend,
    handleRevert,
    handleRetry,
    handleInspectEdit,
    sendErrorToChat,
    handleCompaction,
    handleTruncationRetry,
    handleContinueGeneration,
    clearChat,
  };
}

// Export types for external use
export type { InspectContext };
