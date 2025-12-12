import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Layers, RotateCcw, AlertTriangle, X, MessageSquare, FileCode, History, Settings, ChevronDown, SlidersHorizontal, Upload } from 'lucide-react';
import { FileSystem, ChatMessage, ChatAttachment, FileChange } from '../../types';
import { cleanGeneratedCode, parseMultiFileResponse, GenerationMeta, stripPlanComment, safeParseAIResponse } from '../../utils/cleanCode';
import { extractFilesFromTruncatedResponse } from '../../utils/extractPartialFiles';

// Helper function to extract file list from response
function extractFileListFromResponse(response: string): string[] {
  const files = new Set<string>();

  // Try JSON parsing first (with PLAN comment handling)
  try {
    const cleaned = stripPlanComment(response);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}?/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.files) {
        Object.keys(parsed.files).forEach(file => files.add(file));
      }
    }
  } catch (e) {
    // Continue with regex extraction
  }

  // Extract files using regex patterns
  const patterns = [
    /"([^"]+\.(tsx?|jsx?|css|json|md|sql|ts|js))":/g,
    /(?:^|\n)(src\/[^:\n]+\.(tsx?|jsx?|css|json|md|sql|ts|js))\s*:/gm,
    /(?:create|update|generate)\s+([^"]*\.(?:tsx?|jsx?|css|json|md|sql|ts|js))/gi
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const filePath = match[1] || match[2];
      if (filePath) {
        files.add(filePath);
      }
    }
  });

  return Array.from(files).sort();
}
import { generateContextForPrompt, generateCodeMap } from '../../utils/codemap';
import { debugLog } from '../../hooks/useDebugStore';
import { useTechStack } from '../../hooks/useTechStack';
import { getProviderManager, GenerationRequest, GenerationResponse } from '../../services/ai';
import { FILE_GENERATION_SCHEMA, SUGGESTIONS_SCHEMA, supportsAdditionalProperties } from '../../services/ai/utils/schemas';
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

// Calculate file changes between two file systems
function calculateFileChanges(oldFiles: FileSystem, newFiles: FileSystem): FileChange[] {
  const changes: FileChange[] = [];
  const allKeys = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  allKeys.forEach(path => {
    const oldContent = oldFiles[path] || '';
    const newContent = newFiles[path] || '';

    if (oldContent !== newContent) {
      const oldLines = oldContent ? oldContent.split('\n').length : 0;
      const newLines = newContent ? newContent.split('\n').length : 0;

      let type: 'added' | 'modified' | 'deleted' = 'modified';
      if (!oldContent) type = 'added';
      else if (!newContent) type = 'deleted';

      changes.push({
        path,
        type,
        additions: type === 'deleted' ? 0 : Math.max(0, newLines - oldLines + (type === 'added' ? newLines : 0)),
        deletions: type === 'added' ? 0 : Math.max(0, oldLines - newLines + (type === 'deleted' ? oldLines : 0))
      });
    }
  });

  return changes;
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

  // Streaming state
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingChars, setStreamingChars] = useState(0);
  const [streamingFiles, setStreamingFiles] = useState<string[]>([]);

  // File plan state - detected from response start
  const [filePlan, setFilePlan] = useState<{
    create: string[];
    delete: string[];
    total: number;
    completed: string[];
  } | null>(null);

  // Truncation retry state
  const [truncatedContent, setTruncatedContent] = useState<{
    rawResponse: string;
    prompt: string;
    systemInstruction: string;
    partialFiles?: {
      [filePath: string]: {
        content: string;
        isComplete: boolean;
      };
    };
    attempt: number;
  } | null>(null);

  // Smart continuation state for multi-batch generation
  const [continuationState, setContinuationState] = useState<{
    isActive: boolean;
    originalPrompt: string;
    systemInstruction: string;
    generationMeta: GenerationMeta;
    accumulatedFiles: FileSystem;
    currentBatch: number;
    retryAttempts?: number; // Track retry attempts for current batch
  } | null>(null);

  // External prompt for auto-fill (e.g., from continuation)
  const [externalPrompt, setExternalPrompt] = useState<string>('');

  // AI History - persists across refreshes
  const aiHistory = useAIHistory(currentProject?.id || null);

  // Tech stack configuration
  const { generateSystemInstruction } = useTechStack();

  // Context management
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`);

  // Update session ID when project changes
  useEffect(() => {
    sessionIdRef.current = `${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`;
  }, [currentProject?.id]);

  // Modal exclusivity handlers
  const handleModalOpen = (modalType: 'settings' | 'projects') => {
    setOpenModal(modalType);
  };

  const handleModalClose = (modalType: 'settings' | 'projects' | 'techstack' | 'promptengineer') => {
    setOpenModal(prev => prev === modalType ? null : prev);
  };

  // Sync messages with context manager
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      contextManager.addMessage(
        sessionIdRef.current,
        lastMsg.role,
        // Use llmContent if available (for codebase sync), otherwise use prompt/explanation
        lastMsg.role === 'user' ? (lastMsg.llmContent || lastMsg.prompt || '') : (lastMsg.explanation || lastMsg.error || ''),
        { messageId: lastMsg.id }
      );
    }
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

  // Handle truncation retry
  const handleTruncationRetry = async () => {
    if (!truncatedContent) return;

    const { rawResponse, prompt, systemInstruction, partialFiles, attempt } = truncatedContent;

    // Limit retry attempts to prevent infinite loops
    if (attempt >= 3) {
      setStreamingStatus('❌ Maximum retry attempts reached. Please try a shorter prompt.');
      setTruncatedContent(null);
      return;
    }

    setStreamingStatus(`🔄 Retrying generation (attempt ${attempt + 1}/3)...`);
    setIsGenerating(true);

    try {
      // Extract what was being generated when truncated
      const incompleteResponse = rawResponse;

      // Create a continuation prompt
      const continuationPrompt = `Continue generating from where you left off. Your previous response was truncated:

**Previous incomplete response (first 2000 chars):**
${incompleteResponse.slice(0, 2000)}

**Last 500 chars of incomplete response:**
${incompleteResponse.slice(-500)}

Please continue from exactly where you stopped and complete the response. Make sure to:
1. Complete any incomplete JSON structure
2. Finish any cut-off file content
3. Provide all remaining files
4. Ensure the response is properly formatted JSON

Original prompt: ${prompt}`;

      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const providerName = activeConfig?.name || 'Unknown';
      const currentModel = activeConfig?.defaultModel || selectedModel;

      let fullText = '';
      const startTime = Date.now();

      // Generate continuation
      const response = await manager.generateStream(
        {
          prompt: continuationPrompt,
          systemInstruction,
          maxTokens: 32768, // Use max tokens for retry
          temperature: 0.7
        },
        (chunk) => {
          if (chunk.text) {
            fullText += chunk.text;
          }
        },
        currentModel
      );

      // Combine original response with continuation
      const combinedResponse = incompleteResponse + fullText;

      setStreamingStatus('✨ Parsing combined response...');

      // Try to parse the combined response
      const parseResult = parseMultiFileResponse(combinedResponse);

      if (parseResult && parseResult.files) {
        // Merge with any partial files from previous attempt
        const mergedFiles = { ...parseResult.files };

        // Apply the changes
        reviewChange('Retried Generation (combined)', mergedFiles);
        setStreamingStatus('✅ Successfully recovered from truncation!');
        setTruncatedContent(null);
      } else {
        // Still failed, update truncated content for another retry
        setTruncatedContent({
          rawResponse: combinedResponse,
          prompt,
          systemInstruction,
          partialFiles,
          attempt: attempt + 1
        });
        setStreamingStatus('⚠️ Response still truncated after retry. Click "Retry" to try again.');
      }
    } catch (error) {
      console.error('Retry failed:', error);
      setStreamingStatus('❌ Retry failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Targeted request for specific missing files - more focused than general continuation
  const requestMissingFiles = async (
    missingFiles: string[],
    accumulatedFiles: FileSystem,
    systemInstruction: string
  ): Promise<{ success: boolean; files: FileSystem; explanation?: string }> => {
    if (missingFiles.length === 0) {
      return { success: true, files: accumulatedFiles };
    }

    console.log('[MissingFiles] Requesting specific files:', missingFiles);
    setStreamingStatus(`🎯 Requesting ${missingFiles.length} missing file(s)...`);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;

    // Very focused prompt - only ask for the missing files
    const targetedPrompt = `Generate ONLY the following specific files. These files are missing from the project.

## REQUIRED FILES (generate ALL of these):
${missingFiles.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## CONTEXT
These files should integrate with the existing project structure. Use the same patterns and styles.

## EXISTING FILES FOR REFERENCE:
${Object.keys(accumulatedFiles).slice(0, 5).map(f => `- ${f}`).join('\n')}
${Object.keys(accumulatedFiles).length > 5 ? `... and ${Object.keys(accumulatedFiles).length - 5} more files` : ''}

## CRITICAL INSTRUCTIONS:
1. Generate EXACTLY the ${missingFiles.length} files listed above
2. Use relative imports (./component, ../utils)
3. Return complete file contents - no truncation
4. Use Tailwind CSS for styling
5. Include data-ff-group and data-ff-id attributes on interactive elements

Return ONLY a JSON object with the files:
{
  "files": {
    "${missingFiles[0]}": "// complete file content...",
    ${missingFiles.length > 1 ? `"${missingFiles[1]}": "// complete file content..."` : ''}
  },
  "explanation": "Generated ${missingFiles.length} missing files"
}`;

    try {
      let fullText = '';
      await manager.generateStream(
        {
          prompt: targetedPrompt,
          systemInstruction,
          maxTokens: 32768,
          temperature: 0.7,
          responseFormat: 'json',
          // Only use native schema for providers that support dynamic keys
          responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
            ? FILE_GENERATION_SCHEMA
            : undefined
        },
        (chunk) => {
          if (chunk.text) {
            fullText += chunk.text;
          }
        },
        currentModel
      );

      const parseResult = parseMultiFileResponse(fullText);

      if (parseResult && parseResult.files && Object.keys(parseResult.files).length > 0) {
        const newFiles = { ...accumulatedFiles, ...parseResult.files };
        console.log('[MissingFiles] Successfully generated:', Object.keys(parseResult.files));
        return { success: true, files: newFiles, explanation: parseResult.explanation };
      }

      console.warn('[MissingFiles] No files in response');
      return { success: false, files: accumulatedFiles };
    } catch (error) {
      console.error('[MissingFiles] Request failed:', error);
      return { success: false, files: accumulatedFiles };
    }
  };

  // Smart continuation handler - automatically continues generation for remaining files
  const handleContinueGeneration = async (
    contState?: typeof continuationState,
    existingFiles?: FileSystem
  ) => {
    const state = contState || continuationState;
    if (!state || state.generationMeta.isComplete) {
      console.log('[Continuation] No continuation needed or already complete');
      setContinuationState(null);
      return;
    }

    const { originalPrompt, systemInstruction, generationMeta, accumulatedFiles } = state;
    const { remainingFiles, currentBatch, totalBatches, completedFiles } = generationMeta;

    if (remainingFiles.length === 0) {
      console.log('[Continuation] All files completed');
      setContinuationState(null);
      return;
    }

    setIsGenerating(true);
    // Seamless progress - user sees smooth generation
    setStreamingStatus(`✨ Generating... ${completedFiles.length}/${generationMeta.totalFilesPlanned} files`);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;
    const providerName = activeConfig?.name || 'AI';
    const continuationStartTime = Date.now();

    try {

      // Build continuation prompt (internal - user doesn't see this)
      const continuationPrompt = `Continue generating the remaining files for the project.

## GENERATION CONTEXT
Already completed: ${completedFiles.length} files
Remaining: ${remainingFiles.length} files

### ALREADY COMPLETED FILES:
${completedFiles.map(f => `- ${f}`).join('\n')}

### REMAINING FILES TO GENERATE:
${remainingFiles.map(f => `- ${f}`).join('\n')}

### ORIGINAL REQUEST:
${originalPrompt}

Generate the remaining files. Each file must be COMPLETE and FUNCTIONAL.`;

      let fullText = '';
      let chunkCount = 0;

      const response = await manager.generateStream(
        {
          prompt: continuationPrompt,
          systemInstruction,
          maxTokens: 32768,
          temperature: 0.7,
          responseFormat: 'json',
          // Only use native schema for providers that support dynamic keys
          responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
            ? FILE_GENERATION_SCHEMA
            : undefined
        },
        (chunk) => {
          fullText += chunk.text || '';
          chunkCount++;
          setStreamingChars(fullText.length);

          // Only update status occasionally to avoid flickering
          if (chunkCount % 50 === 0) {
            setStreamingStatus(`✨ Generating... ${completedFiles.length}/${generationMeta.totalFilesPlanned} files (${Math.round(fullText.length / 1024)}KB)`);
          }
        },
        currentModel
      );

      setStreamingStatus('✨ Finalizing...');
      console.log('[Continuation] Raw response length:', fullText.length);

      const parseResult = parseMultiFileResponse(fullText);
      console.log('[Continuation] Parse result:', {
        hasFiles: !!parseResult?.files,
        fileCount: parseResult ? Object.keys(parseResult.files).length : 0,
        fileNames: parseResult ? Object.keys(parseResult.files) : []
      });

      if (!parseResult || !parseResult.files || Object.keys(parseResult.files).length === 0) {
        console.error('[Continuation] Failed to parse - no files found');
        throw new Error('Failed to parse continuation response - no files found');
      }

      // Check for truncation and auto-retry if needed
      if (parseResult.truncated) {
        const currentRetryAttempts = state.retryAttempts || 0;
        const maxRetryAttempts = 3;

        if (currentRetryAttempts < maxRetryAttempts) {
          console.log(`[Continuation] Response truncated, auto-retry attempt ${currentRetryAttempts + 1}/${maxRetryAttempts}`);
          setStreamingStatus(`🔄 Response truncated, retrying (${currentRetryAttempts + 1}/${maxRetryAttempts})...`);

          // Merge any partial files we got before retrying
          const partialAccumulatedFiles = { ...accumulatedFiles, ...parseResult.files };

          const retryState = {
            ...state,
            accumulatedFiles: partialAccumulatedFiles,
            retryAttempts: currentRetryAttempts + 1
          };
          setContinuationState(retryState);

          // Wait before retrying (exponential backoff)
          setTimeout(() => {
            handleContinueGeneration(retryState, existingFiles);
          }, 1000 * (currentRetryAttempts + 1));

          return; // Exit this attempt
        } else {
          console.warn('[Continuation] Max retries for truncation reached, proceeding with partial files');
        }
      }

      // Merge new files with accumulated files
      const newAccumulatedFiles = { ...accumulatedFiles, ...parseResult.files };
      const newCompletedFiles = [...new Set([...completedFiles, ...Object.keys(parseResult.files)])]; // Deduplicate

      // Update remaining files - check both exact match and filename match
      const generatedFileNames = Object.keys(parseResult.files).map(f => f.split('/').pop());
      const newRemainingFiles = remainingFiles.filter(f => {
        const fileName = f.split('/').pop();
        const exactMatch = parseResult.files[f];
        const nameMatch = generatedFileNames.includes(fileName);
        return !exactMatch && !nameMatch;
      });

      // If we generated ANY new files, consider progress made
      const madeProgress = Object.keys(parseResult.files).length > 0;

      // Check if generation is complete
      const isComplete = newRemainingFiles.length === 0 ||
        (parseResult.generationMeta?.isComplete === true);

      console.log('[Continuation] Batch complete:', {
        newFiles: Object.keys(parseResult.files).length,
        totalAccumulated: Object.keys(newAccumulatedFiles).length,
        totalCompleted: newCompletedFiles.length,
        remaining: newRemainingFiles.length,
        remainingFiles: newRemainingFiles,
        isComplete,
        madeProgress
      });

      // Seamless progress update
      setStreamingStatus(`✨ Generating... ${newCompletedFiles.length}/${generationMeta.totalFilesPlanned} files`);

      // Update file plan to show completed files
      if (filePlan) {
        setFilePlan({
          ...filePlan,
          completed: newCompletedFiles
        });
      }

      // Safety: Force complete if we've done too many batches or no progress
      const maxBatches = 5;
      const shouldForceComplete = currentBatch >= maxBatches || !madeProgress;

      if (isComplete || shouldForceComplete) {
        // All done! Show final result
        if (shouldForceComplete && !isComplete) {
          console.log('[Continuation] Forcing completion - max batches reached or no progress');
        }

        // VALIDATE: Filter out empty or malformed files
        const validFiles: FileSystem = {};
        const invalidFiles: string[] = [];

        for (const [path, content] of Object.entries(newAccumulatedFiles)) {
          // Check for valid file path
          if (!path || path.includes('/.') || !path.match(/\.[a-z]+$/i)) {
            console.warn('[Continuation] Invalid file path:', path);
            invalidFiles.push(path);
            continue;
          }

          // Check for valid content (more than just extension or very short)
          const contentStr = typeof content === 'string' ? content : '';
          if (contentStr.length < 20 || /^(tsx|jsx|ts|js|css|json|md);?$/.test(contentStr.trim())) {
            console.warn('[Continuation] Empty or malformed file content:', path, '- content:', contentStr.slice(0, 50));
            invalidFiles.push(path);
            continue;
          }

          validFiles[path] = contentStr;
        }

        // Log validation results
        console.log('[Continuation] File validation:', {
          total: Object.keys(newAccumulatedFiles).length,
          valid: Object.keys(validFiles).length,
          invalid: invalidFiles
        });

        // If no valid files, show error
        if (Object.keys(validFiles).length === 0) {
          console.error('[Continuation] No valid files generated!');
          setStreamingStatus('❌ Generation failed - no valid files received');
          setIsGenerating(false);
          setContinuationState(null);
          setFilePlan(null);

          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            error: `Generation failed - files were empty or malformed.\n\nInvalid files: ${invalidFiles.join(', ')}\n\nPlease try again.`,
            snapshotFiles: { ...files }
          };
          setMessages(prev => [...prev, errorMessage]);
          return;
        }

        // Merge with existing project files
        const finalFiles = existingFiles ? { ...existingFiles, ...validFiles } : validFiles;
        const generatedFileList = Object.keys(validFiles);

        console.log('[Continuation] Complete:', {
          fileCount: Object.keys(finalFiles).length,
          validFiles: generatedFileList,
          invalidFiles,
          forced: shouldForceComplete && !isComplete
        });

        // Calculate file changes for display
        const fileChanges = calculateFileChanges(files, finalFiles);

        // Build comprehensive explanation
        let explanationText = parseResult.explanation || 'Generation complete.';

        if (invalidFiles.length > 0) {
          explanationText += `\n\n⚠️ **${invalidFiles.length} files were invalid and excluded.**`;
        }

        // IMPORTANT: Add completion message FIRST (before clearing generating UI)
        const completionMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation: explanationText,
          files: validFiles,
          fileChanges,
          snapshotFiles: { ...files },
          model: currentModel,
          provider: providerName,
          generationTime: Date.now() - continuationStartTime,
          tokenUsage: response?.usage ? {
            inputTokens: response.usage.inputTokens || 0,
            outputTokens: response.usage.outputTokens || 0,
            totalTokens: (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0)
          } : undefined
        };
        setMessages(prev => [...prev, completionMessage]);

        // Update status to show completion
        setStreamingStatus(`✅ Generated ${generatedFileList.length} files!`);

        // Small delay to ensure message renders before modal opens
        setTimeout(() => {
          setContinuationState(null);
          setIsGenerating(false);
          setFilePlan(null);

          // Apply changes (shows diff modal if auto-accept is off)
          reviewChange('Generated App', finalFiles);
        }, 100);

        return;
      } else {
        // Continue seamlessly - user doesn't notice the transition
        const newGenerationMeta: GenerationMeta = {
          totalFilesPlanned: generationMeta.totalFilesPlanned,
          filesInThisBatch: Object.keys(parseResult.files),
          completedFiles: newCompletedFiles,
          remainingFiles: newRemainingFiles,
          currentBatch: currentBatch + 1,
          totalBatches,
          isComplete: false
        };

        const newContState = {
          isActive: true,
          originalPrompt,
          systemInstruction,
          generationMeta: newGenerationMeta,
          accumulatedFiles: newAccumulatedFiles,
          currentBatch: currentBatch + 1,
          retryAttempts: 0 // Reset retry counter for new batch
        };

        setContinuationState(newContState);

        console.log('[Continuation] Starting next batch:', currentBatch + 1);

        // Continue immediately - seamless experience
        setTimeout(() => {
          handleContinueGeneration(newContState, existingFiles);
        }, 50); // Minimal delay
      }
    } catch (error) {
      console.error('[Continuation] Error:', error);

      // Auto-retry logic - retry up to 3 times before giving up
      const currentRetryAttempts = state.retryAttempts || 0;
      const maxRetryAttempts = 3;

      if (currentRetryAttempts < maxRetryAttempts && generationMeta.remainingFiles.length > 0) {
        console.log(`[Continuation] Auto-retry attempt ${currentRetryAttempts + 1}/${maxRetryAttempts}`);
        setStreamingStatus(`🔄 Retrying batch (attempt ${currentRetryAttempts + 1}/${maxRetryAttempts})...`);

        // Create new state with incremented retry counter
        const retryState = {
          ...state,
          retryAttempts: currentRetryAttempts + 1
        };
        setContinuationState(retryState);

        // Wait 1 second before retrying (exponential backoff)
        setTimeout(() => {
          handleContinueGeneration(retryState, existingFiles);
        }, 1000 * (currentRetryAttempts + 1)); // 1s, 2s, 3s delays

        return; // Don't fall through to error handling
      }

      // All retries exhausted - try targeted request for missing files
      if (generationMeta.remainingFiles.length > 0 && Object.keys(accumulatedFiles).length > 0) {
        console.log('[Continuation] Retries exhausted, trying targeted request for:', generationMeta.remainingFiles);
        setStreamingStatus(`🎯 Requesting ${generationMeta.remainingFiles.length} missing file(s) directly...`);

        // Try targeted request for missing files
        const targetedResult = await requestMissingFiles(
          generationMeta.remainingFiles,
          accumulatedFiles,
          systemInstruction
        );

        if (targetedResult.success) {
          // Check which files are still missing after targeted request
          const stillMissing = generationMeta.remainingFiles.filter(
            f => !targetedResult.files[f]
          );

          const generatedFileList = Object.keys(targetedResult.files);
          const finalFiles = existingFiles ? { ...existingFiles, ...targetedResult.files } : targetedResult.files;
          const fileChanges = calculateFileChanges(files, finalFiles);

          // Use AI's explanation, with fallback for missing files info
          let explanationText = targetedResult.explanation || 'Generation complete.';
          if (stillMissing.length > 0) {
            explanationText += `\n\n⚠️ **${stillMissing.length} files could not be generated:** ${stillMissing.join(', ')}`;
          }

          const completionMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: explanationText,
            files: targetedResult.files,
            fileChanges,
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName,
            generationTime: Date.now() - continuationStartTime
          };
          setMessages(prev => [...prev, completionMessage]);
          setStreamingStatus(`✅ Generated ${generatedFileList.length} files${stillMissing.length > 0 ? ` (${stillMissing.length} missing)` : ''}`);

          // Complete generation
          setTimeout(() => {
            setContinuationState(null);
            setIsGenerating(false);
            setFilePlan(null);
            reviewChange('Generated App', finalFiles);
          }, 100);
          return;
        }
      }

      // Targeted request also failed or no accumulated files - show what we have
      if (Object.keys(accumulatedFiles).length > 0) {
        console.log('[Continuation] All attempts exhausted, showing accumulated files:', Object.keys(accumulatedFiles));

        const generatedFileList = Object.keys(accumulatedFiles);
        const finalFiles = existingFiles ? { ...existingFiles, ...accumulatedFiles } : accumulatedFiles;
        const fileChanges = calculateFileChanges(files, finalFiles);

        // Use last known explanation or simple fallback
        const explanationText = `Generation complete.\n\n⚠️ **${generationMeta.remainingFiles.length} files could not be generated:** ${generationMeta.remainingFiles.join(', ')}`;

        const completionMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation: explanationText,
          files: accumulatedFiles,
          fileChanges,
          snapshotFiles: { ...files },
          model: currentModel,
          provider: providerName,
          generationTime: Date.now() - continuationStartTime
        };
        setMessages(prev => [...prev, completionMessage]);

        setStreamingStatus(`✅ Generated ${generatedFileList.length} files (${generationMeta.remainingFiles.length} missing)`);

        setTimeout(() => {
          setContinuationState(null);
          setIsGenerating(false);
          setFilePlan(null);
          reviewChange('Generated App', finalFiles);
        }, 100);
      } else {
        setStreamingStatus('❌ Generation failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        setIsGenerating(false);
        setContinuationState(null);
        setFilePlan(null);

        // Show error message
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation: `❌ **Generation failed:** ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
          snapshotFiles: { ...files }
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    }
    // Note: No finally block needed - success path handles setIsGenerating in if(isComplete) block,
    // multi-batch path keeps generating, and error path handles it above
  };

  // Inspect context for targeted element editing
  interface InspectContext {
    element: InspectedElement;
    scope: EditScope;
  }

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
        // INSPECT EDIT MODE - Strict element-scoped editing (takes priority over consultant mode)
        const { element, scope } = inspectContext;
        console.log('[InspectEdit] Context received:', { element, scope, prompt });

        // Build a specific selector for the target element
        const buildElementSelector = (): string => {
          // 1. FluidFlow ID (most specific for single element)
          if (scope === 'element' && element.ffId) {
            return `data-ff-id="${element.ffId}"`;
          }
          // 2. FluidFlow Group (for group editing)
          if (scope === 'group' && element.ffGroup) {
            return `data-ff-group="${element.ffGroup}"`;
          }
          // 3. HTML id attribute
          if (element.id) {
            return `#${element.id}`;
          }
          // 4. CSS classes (filter out generated/utility prefixes, take meaningful ones)
          if (element.className) {
            const classes = element.className.split(' ')
              .filter(c => c && c.length > 2 && !c.startsWith('css-') && !c.match(/^[a-z]+-\d+$/))
              .slice(0, 3);
            if (classes.length > 0) {
              return `<${element.tagName.toLowerCase()}>.${classes.join('.')}`;
            }
          }
          // 5. Text content as identifier
          if (element.textContent && element.textContent.trim().length > 0) {
            const text = element.textContent.trim().slice(0, 40);
            return `<${element.tagName.toLowerCase()}> with text "${text}"`;
          }
          // 6. Tag + component (last resort)
          return `<${element.tagName.toLowerCase()}> in ${element.componentName || 'component'}`;
        };

        const targetSelector = buildElementSelector();
        console.log('[InspectEdit] Target selector:', targetSelector);

        const systemInstruction = `You are an expert React Developer performing a SURGICAL EDIT on a specific element.

## 🚨 CRITICAL: STRICT SCOPE ENFORCEMENT 🚨

**TARGET**: ${scope === 'element' ? 'SINGLE ELEMENT' : 'ELEMENT GROUP'}
**SELECTOR**: ${targetSelector}
**COMPONENT**: ${element.componentName || 'Unknown'}

### ABSOLUTE RULES - VIOLATION = FAILURE

1. **ONLY modify the element(s) matching**: ${targetSelector}
2. **DO NOT touch ANY other elements** - not siblings, not parents, not children of other elements
3. **DO NOT add new components or sections**
4. **DO NOT restructure the component hierarchy**
5. **DO NOT change imports unless absolutely necessary for the specific element**
6. **DO NOT modify any element that does NOT have the target selector**

### WHAT YOU CAN CHANGE (ONLY for target element):
- Tailwind classes on the target element
- Text content of the target element
- Style properties of the target element
- Add/modify props on the target element ONLY

### WHAT YOU CANNOT CHANGE:
- Parent elements (even their classes)
- Sibling elements
- Other components
- Component structure/hierarchy
- Layout or positioning of other elements
- Adding new HTML elements outside the target

### VERIFICATION CHECKLIST:
Before outputting, verify:
✅ Changes ONLY affect element with ${targetSelector}
✅ No new elements added outside target
✅ No structural changes to component
✅ Parent/sibling elements are IDENTICAL to original

**RESPONSE FORMAT (MANDATORY)**:
Line 1: File plan
Line 2+: JSON with files

// PLAN: {"create":[],"update":["${element.componentName ? `src/components/${element.componentName}.tsx` : 'src/App.tsx'}"],"delete":[],"total":1}

{
  "explanation": "Modified ONLY the ${element.tagName.toLowerCase()} element with ${targetSelector}: [describe specific changes]",
  "files": {
    "${element.componentName ? `src/components/${element.componentName}.tsx` : 'src/App.tsx'}": "// complete file content..."
  }
}

**CODE REQUIREMENTS**:
- Use Tailwind CSS for styling
- Preserve ALL existing data-ff-group and data-ff-id attributes
- Keep file structure identical except for target element changes`;

        // Add tech stack
        const techStackInstruction = generateSystemInstruction();

        // Build the prompt with element context
        const elementDetails = `
## TARGET ELEMENT DETAILS:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
${element.ffGroup ? `- FluidFlow Group: data-ff-group="${element.ffGroup}"` : ''}
${element.ffId ? `- FluidFlow ID: data-ff-id="${element.ffId}"` : ''}
- Text: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent chain: ${element.parentComponents.join(' > ')}` : ''}

## USER REQUEST:
${prompt}

## REMINDER: Only modify the element with ${targetSelector}. Everything else MUST remain unchanged.`;

        const promptParts: string[] = [elementDetails];
        const images: { data: string; mimeType: string }[] = [];

        // Add codemap context for better AI understanding
        const codeContext = generateContextForPrompt(files);
        promptParts.push(`\n${codeContext}`);

        // Add target component file content (more efficient than all files)
        const targetFilePath = element.componentName
          ? Object.keys(files).find(p => p.includes(element.componentName!)) || 'src/App.tsx'
          : 'src/App.tsx';
        const targetFileContent = files[targetFilePath];
        if (targetFileContent) {
          promptParts.push(`\n## TARGET FILE TO MODIFY:\n**${targetFilePath}**\n\`\`\`tsx\n${targetFileContent}\n\`\`\``);
        }

        // Add related files if any (imports from target file)
        const targetFileInfo = generateCodeMap(files).files.find(f => f.path === targetFilePath);
        if (targetFileInfo) {
          const relatedPaths = targetFileInfo.imports
            .filter(i => i.from.startsWith('.'))
            .map(i => {
              const base = targetFilePath.substring(0, targetFilePath.lastIndexOf('/'));
              return i.from.startsWith('./')
                ? `${base}/${i.from.slice(2)}.tsx`
                : `${base}/${i.from}.tsx`;
            })
            .filter(p => files[p]);

          if (relatedPaths.length > 0) {
            promptParts.push('\n## RELATED FILES (for context only, do NOT modify unless necessary):');
            for (const path of relatedPaths.slice(0, 3)) {
              promptParts.push(`\n**${path}**\n\`\`\`tsx\n${files[path]}\n\`\`\``);
            }
          }
        }

        const finalPrompt = promptParts.join('\n');

        // Make AI request
        debugLog.request('quick-edit', {
          model: currentModel,
          prompt: finalPrompt.slice(0, 500) + '...',
          metadata: { element: element.ffId || element.tagName, scope }
        });

        setStreamingStatus('🎯 Editing element...');

        const response = await manager.generate({
          prompt: finalPrompt,
          systemInstruction: systemInstruction + techStackInstruction,
          responseFormat: 'json',
          images: images.length > 0 ? images : undefined,
          debugCategory: 'quick-edit',
          // Only use native schema for providers that support dynamic keys
          responseSchema: activeProvider?.type && supportsAdditionalProperties(activeProvider.type)
            ? FILE_GENERATION_SCHEMA
            : undefined
        }, currentModel);

        const rawResponse = response.text || '';

        // Parse response (with PLAN comment handling)
        const parsed = safeParseAIResponse<{ files?: Record<string, string>; explanation?: string }>(rawResponse);
        if (parsed?.files && Object.keys(parsed.files).length > 0) {
          const newFiles = { ...files, ...parsed.files };

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: parsed.explanation || `🎯 Modified element: ${targetSelector}`,
            files: parsed.files,
            fileChanges: calculateFileChanges(files, newFiles),
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName
          };
          setMessages(prev => [...prev, assistantMessage]);

          reviewChange(`Edit: ${element.ffId || element.tagName}`, newFiles);
        }

        setIsGenerating(false);
        return;

      } else if (isConsultantMode) {
        // Consultant mode - return suggestions
        const systemInstruction = `You are a Senior Product Manager and UX Expert. Analyze the provided wireframe/sketch deeply.
Identify missing UX elements, accessibility gaps, logical inconsistencies, or edge cases.
Output ONLY a raw JSON array of strings containing your specific suggestions. Do not include markdown formatting.`;

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
        // Generate/Update app mode
        let systemInstruction = `You are an expert React Developer. Your task is to generate or update a React application.

**CRITICAL: FILE PLAN FIRST**
Your response MUST start with a plan line before JSON. This enables real-time progress tracking.

**RESPONSE FORMAT (MANDATORY)**:
Line 1: File plan (MUST be first line, enables streaming progress)
Line 2+: JSON with files

Example response:
\`\`\`
// PLAN: {"create":["src/components/Header.tsx","src/components/Footer.tsx"],"update":["src/App.tsx"],"delete":[],"total":3}
{
  "explanation": "Created 2 new files, updated 1 existing...",
  "files": {
    "src/App.tsx": "...",
    "src/components/Header.tsx": "...",
    "src/components/Footer.tsx": "..."
  }
}
\`\`\`

**PLAN FORMAT**:
// PLAN: {"create":["file1.tsx",...],"update":["existing.tsx",...],"delete":["old.tsx",...],"total":N}

- "create": NEW files you will generate
- "update": EXISTING files you will modify
- "delete": Files to be removed
- "total": Total number of files (create + update)

**BATCH RULES**:
- Generate up to 5 files per response (prevents truncation)
- Keep each file under 300 lines OR under 4000 characters
- If total > 5 files, include "generationMeta" for continuation:

{
  "generationMeta": {
    "totalFilesPlanned": 8,
    "filesInThisBatch": ["src/App.tsx", "src/components/Header.tsx", "src/components/Footer.tsx"],
    "completedFiles": ["src/App.tsx", "src/components/Header.tsx", "src/components/Footer.tsx"],
    "remainingFiles": ["src/components/Sidebar.tsx", "src/components/Card.tsx", "src/styles/globals.css", "src/utils/helpers.ts", "src/types/index.ts"],
    "currentBatch": 1,
    "totalBatches": 2,
    "isComplete": false
  },
  "explanation": "Generated 3 files (batch 1/2). 5 more files remaining: Sidebar, Card, globals.css, helpers, types.",
  "files": {
    "src/App.tsx": "// file content...",
    "src/components/Header.tsx": "// file content...",
    "src/components/Footer.tsx": "// file content..."
  }
}

When ALL files are complete:
{
  "generationMeta": {
    "totalFilesPlanned": 8,
    "filesInThisBatch": ["src/components/Sidebar.tsx", "src/components/Card.tsx", ...],
    "completedFiles": ["src/App.tsx", "src/components/Header.tsx", ...all 8 files],
    "remainingFiles": [],
    "currentBatch": 2,
    "totalBatches": 2,
    "isComplete": true
  },
  "explanation": "All 8 files generated successfully!",
  "files": { ... }
}

**CONTINUATION RULES**:
- If totalFilesPlanned > 5, split into batches of 5
- ALWAYS list ALL planned files in first response's generationMeta
- completedFiles accumulates across batches
- remainingFiles decreases as batches complete
- isComplete: true only when remainingFiles is empty

**CODE REQUIREMENTS**:
- Entry point MUST be 'src/App.tsx' - ONLY for routing/layout, import components
- EVERY UI component MUST be in its OWN SEPARATE FILE - NO multiple components per file
- Break UI into logical sub-components in 'src/components/{feature}/' folders
- File structure: src/components/Header/Header.tsx, src/components/Header/HeaderNav.tsx, etc.
- Use RELATIVE import paths (e.g., './components/Header' from App.tsx)
- Use Tailwind CSS for styling (NO inline styles or CSS-in-JS)
- Use 'lucide-react' for icons
- Create realistic mock data (5-8 entries), NO "Lorem Ipsum"
- Modern, clean aesthetic with generous padding
- CRITICAL: Keep files SMALL - under 300 lines AND under 4000 characters each
- Add data-ff-group="group-name" and data-ff-id="element-id" to ALL interactive elements (buttons, inputs, links, cards, sections)
- Example: <button data-ff-group="header" data-ff-id="menu-btn">Menu</button>

**EXPLANATION REQUIREMENTS**:
Write a clear markdown explanation including:
- What was built/changed (with batch progress: "Batch X/Y")
- List of components created with brief descriptions
- Any technical decisions or patterns used
- If not complete: list remaining files to be generated`;

        if (brandAtt) {
          systemInstruction += `\n\n**BRANDING**: Extract the PRIMARY DOMINANT COLOR from the brand logo and use it for primary actions/accents.`;
        }

        if (isEducationMode) {
          systemInstruction += `\n\n**EDUCATION MODE**: Add detailed inline comments explaining complex Tailwind classes and React hooks.`;
        }

        
        // Add technology stack instructions
        systemInstruction += generateSystemInstruction();

        // Build prompt parts
        const promptParts: string[] = [];
        const images: { data: string; mimeType: string }[] = [];

        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          promptParts.push('SKETCH/WIREFRAME: [attached image]');
          images.push({ data: base64Data, mimeType: sketchAtt.file.type });
        }

        if (brandAtt) {
          const base64Data = brandAtt.preview.split(',')[1];
          promptParts.push('BRAND LOGO: [attached image]');
          images.push({ data: base64Data, mimeType: brandAtt.file.type });
        }

        if (existingApp) {
          // Generate codemap for better context understanding
          const codeContext = generateContextForPrompt(files);

          // For efficiency, only send file summaries, not full content
          const fileSummaries = Object.entries(files).map(([path, content]) => {
            const contentStr = typeof content === 'string' ? content : String(content);
            return {
              path,
              preview: contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr,
              size: contentStr.length,
              lines: contentStr.split('\n').length
            };
          });

          promptParts.push(`${codeContext}\n\n### Current Files Summary\n\`\`\`json\n${JSON.stringify(fileSummaries, null, 2)}\n\`\`\``);
          promptParts.push(`USER REQUEST: ${prompt || 'Refine the app based on the attached images.'}`);
          systemInstruction += `\n\nYou are UPDATING an existing project. Use EFFICIENT file updates to save tokens:

**FILE UPDATE STRATEGY**:
- ONLY include files that actually need changes in your response
- For new files: include full content with "isnew": true flag
- For modified files: include full content (this is required as diff can be unreliable)
- NEVER include unchanged files

**RESPONSE FORMAT**: Use this enhanced JSON structure:
{
  "explanation": "markdown explanation of changes",
  "files": {
    "src/App.tsx": "full content of modified file",
    "src/components/NewComponent.tsx": "full content of new file"
  },
  "deletedFiles": ["src/components/OldComponent.tsx"], // optional
  "fileChanges": { // optional summary of what changed
    "src/App.tsx": "Added new button and updated styles",
    "src/components/NewComponent.tsx": "Created new component for feature X"
  }
}

**TOKEN OPTIMIZATION**: Only send the files that need modifications. The system will merge your changes with the existing codebase.`;
        } else {
          promptParts.push(`TASK: Create a React app from this design. ${prompt ? `Additional context: ${prompt}` : ''}`);
        }

        const request: GenerationRequest = {
          prompt: promptParts.join('\n\n'),
          systemInstruction,
          images,
          responseFormat: 'json',
          // Only use native schema enforcement for providers that support dynamic keys
          // (FILE_GENERATION_SCHEMA uses additionalProperties for file paths)
          responseSchema: activeProvider?.type && supportsAdditionalProperties(activeProvider.type)
            ? FILE_GENERATION_SCHEMA
            : undefined
        };

        // Use streaming for better UX
        setStreamingStatus(`🚀 Starting generation with ${providerName}...`);
        setStreamingChars(0);
        setStreamingFiles([]);
        setFilePlan(null); // Reset file plan

        const genRequestId = debugLog.request('generation', {
          model: currentModel,
          prompt: prompt || 'Generate/Update app',
          systemInstruction,
          attachments: attachments.map(a => ({ type: a.type, size: a.file.size })),
          metadata: { mode: 'generator', hasExistingApp: !!existingApp, provider: providerName }
        });
        const genStartTime = Date.now();

        let fullText = '';
        let detectedFiles: string[] = [];
        let chunkCount = 0;
        let streamResponse: GenerationResponse | null = null;
        let currentFilePlan: { create: string[]; delete: string[]; total: number; completed: string[] } | null = null;
        let planParsed = false;

        // Create initial stream log entry (will be updated during streaming)
        const streamLogId = `stream-${genRequestId}`;
        debugLog.stream('generation', {
          id: streamLogId,
          model: currentModel,
          response: 'Streaming started...',
          metadata: { chunkCount: 0, totalChars: 0, filesDetected: 0, status: 'streaming' }
        });

        // Use streaming API
        streamResponse = await manager.generateStream(
          request,
          (chunk) => {
            const chunkText = chunk.text || '';
            fullText += chunkText;
            chunkCount++;
            setStreamingChars(fullText.length);

            // Try to parse file plan from the start of response (// PLAN: {...})
            if (!planParsed && fullText.length > 50) {
              // More robust regex to capture JSON with nested arrays
              const planLineMatch = fullText.match(/\/\/\s*PLAN:\s*(\{.+)/);
              if (planLineMatch) {
                try {
                  let jsonStr = planLineMatch[1];
                  // Find the balanced closing brace
                  let braceCount = 0;
                  let endIdx = 0;
                  for (let i = 0; i < jsonStr.length; i++) {
                    if (jsonStr[i] === '{') braceCount++;
                    if (jsonStr[i] === '}') braceCount--;
                    if (braceCount === 0) {
                      endIdx = i + 1;
                      break;
                    }
                  }
                  if (endIdx > 0) {
                    jsonStr = jsonStr.substring(0, endIdx);
                  }

                  // Fix malformed JSON (e.g., "total":} -> remove it)
                  jsonStr = jsonStr
                    .replace(/"total"\s*:\s*[}\]]/g, '') // Remove "total":} or "total":]
                    .replace(/,\s*}/g, '}') // Remove trailing commas before }
                    .replace(/,\s*]/g, ']'); // Remove trailing commas before ]

                  const plan = JSON.parse(jsonStr);
                  // Support both "create" and "update" keys
                  const createFiles = plan.create || [];
                  const updateFiles = plan.update || [];
                  const allFiles = [...createFiles, ...updateFiles];

                  if (allFiles.length > 0) {
                    currentFilePlan = {
                      create: allFiles, // All files to generate (both new and updates)
                      delete: plan.delete || [],
                      total: plan.total || allFiles.length, // Fallback to calculated count
                      completed: []
                    };
                    setFilePlan(currentFilePlan);
                    planParsed = true;
                    console.log('[Stream] File plan detected:', currentFilePlan);
                    setStreamingStatus(`📋 Plan: ${currentFilePlan.total} files (${createFiles.length} new, ${updateFiles.length} update)`);
                  }
                } catch (e) {
                  // Plan not complete yet or malformed - try regex extraction as fallback
                  const createMatch = fullText.match(/"create"\s*:\s*\[([^\]]*)\]/);
                  const updateMatch = fullText.match(/"update"\s*:\s*\[([^\]]*)\]/);

                  if (createMatch || updateMatch) {
                    const extractFiles = (match: RegExpMatchArray | null) => {
                      if (!match) return [];
                      return match[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
                    };

                    const createFiles = extractFiles(createMatch);
                    const updateFiles = extractFiles(updateMatch);
                    const allFiles = [...createFiles, ...updateFiles];

                    if (allFiles.length > 0) {
                      currentFilePlan = {
                        create: allFiles,
                        delete: [],
                        total: allFiles.length,
                        completed: []
                      };
                      setFilePlan(currentFilePlan);
                      planParsed = true;
                      console.log('[Stream] File plan extracted via regex:', currentFilePlan);
                      setStreamingStatus(`📋 Plan: ${currentFilePlan.total} files`);
                    }
                  } else {
                    console.debug('[Stream] Plan parse attempt failed, waiting for more data');
                  }
                }
              }
            }

            // Update the stream log every 50 chunks (less frequent to avoid re-render issues)
            if (chunkCount % 50 === 0) {
              try {
                debugLog.streamUpdate(streamLogId, {
                  response: `Streaming... ${Math.round(fullText.length / 1024)}KB received`,
                  metadata: { chunkCount, totalChars: fullText.length, filesDetected: detectedFiles.length, status: 'streaming' }
                });
              } catch (e) {
                console.debug('[Debug] Stream update failed:', e);
              }
            }

            // Try to detect file paths as they appear (match any file path in JSON)
            const fileMatches = fullText.match(/"([^"]+\.(tsx?|jsx?|css|json|md|sql))"\s*:/g);
            if (fileMatches) {
              const newMatchedFiles = fileMatches
                .map(m => m.replace(/[":\s]/g, ''))
                .filter(f => !detectedFiles.includes(f) && !f.includes('\\'));
              if (newMatchedFiles.length > 0) {
                detectedFiles = [...detectedFiles, ...newMatchedFiles];
                setStreamingFiles([...detectedFiles]);

                // Update completed files in plan
                if (currentFilePlan) {
                  currentFilePlan.completed = detectedFiles.filter(f => currentFilePlan!.create.includes(f));
                  setFilePlan({ ...currentFilePlan });

                  // Show different status based on completion
                  if (currentFilePlan.completed.length >= currentFilePlan.total) {
                    setStreamingStatus(`✅ ${currentFilePlan.total} files received, finalizing...`);
                  } else {
                    setStreamingStatus(`📁 ${currentFilePlan.completed.length}/${currentFilePlan.total} files received`);
                  }
                } else {
                  setStreamingStatus(`📁 ${detectedFiles.length} files detected`);
                }
              }
            }

            // Update status with character count
            if (detectedFiles.length === 0) {
              setStreamingStatus(`⚡ Generating... (${Math.round(fullText.length / 1024)}KB)`);
            }
          },
          currentModel
        );

        // Mark stream as complete (pass true to immediately notify UI)
        console.log('[Generation] Stream complete:', {
          chars: fullText.length,
          chunks: chunkCount,
          filesDetected: detectedFiles.length
        });

        try {
          debugLog.streamUpdate(streamLogId, {
            response: `Completed: ${Math.round(fullText.length / 1024)}KB, ${chunkCount} chunks`,
            metadata: { chunkCount, totalChars: fullText.length, filesDetected: detectedFiles.length, status: 'complete' }
          }, true); // complete=true for immediate UI update
        } catch (e) {
          console.debug('[Debug] Final stream update failed:', e);
        }

        // Show parsing status - stream is complete, now processing
        setStreamingStatus(`✨ Processing ${detectedFiles.length} files...`);

        // Save raw response for debugging (stored in window for easy access)
        try {
          (window as any).__lastAIResponse = {
            raw: fullText,
            timestamp: Date.now(),
            chars: fullText.length,
            filesDetected: detectedFiles
          };
          console.log('[Debug] Raw response saved to window.__lastAIResponse (' + fullText.length + ' chars)');
        } catch (e) {
          console.debug('[Debug] Could not save raw response:', e);
        }

        try {
          // Use robust parser with truncation repair
          const parseResult = parseMultiFileResponse(fullText);
          if (!parseResult) {
            throw new Error('Could not parse response - no valid file content found');
          }

          const explanation = parseResult.explanation || 'App generated successfully.';
          let newFiles = parseResult.files;
          const deletedFiles = parseResult.deletedFiles || [];

          // Warn if response was truncated but we recovered
          if (parseResult.truncated) {
            console.warn('[Generation] Response was truncated but partially recovered');
            setStreamingStatus('⚠️ Response truncated - showing recovered files');
          }

          // Log the efficiency (token savings)
          if (deletedFiles.length > 0 || (existingApp && Object.keys(newFiles).length < Object.keys(files).length)) {
            console.log(`🚀 Efficient update: Only ${Object.keys(newFiles).length} files modified, ${deletedFiles.length} deleted`);
          }

          debugLog.response('generation', {
            id: genRequestId,
            model: currentModel,
            duration: Date.now() - genStartTime,
            response: JSON.stringify({
              explanation,
              fileCount: Object.keys(newFiles).length,
              deletedCount: deletedFiles.length,
              files: Object.keys(newFiles),
              deletedFiles
            }),
            metadata: {
              mode: 'generator',
              totalChunks: chunkCount,
              totalChars: fullText.length,
              provider: providerName,
              efficientUpdate: existingApp && Object.keys(newFiles).length < Object.keys(files).length
            }
          });

          // Clean code in each file
          for (const [path, content] of Object.entries(newFiles)) {
            if (typeof content === 'string') {
              newFiles[path] = cleanGeneratedCode(content);
            }
          }

          // For new projects, ensure we have src/App.tsx
          if (!existingApp && !newFiles['src/App.tsx']) {
            throw new Error('No src/App.tsx in response');
          }

          // Merge files efficiently
          let mergedFiles: Record<string, string>;
          if (existingApp) {
            // Start with existing files and apply updates
            mergedFiles = { ...files };

            // Apply new/modified files
            Object.assign(mergedFiles, newFiles);

            // Remove deleted files
            for (const deletedPath of deletedFiles) {
              delete mergedFiles[deletedPath];
            }
          } else {
            // New project - just use generated files
            mergedFiles = newFiles;
          }

          const fileChanges = calculateFileChanges(files, mergedFiles);

          // Check for missing files based on filePlan (session-based continuation)
          if (currentFilePlan && currentFilePlan.create.length > 0) {
            const receivedFiles = Object.keys(newFiles);
            const missingFiles = currentFilePlan.create.filter(f => !receivedFiles.includes(f));

            if (missingFiles.length > 0) {
              console.log('[Generation] Missing files detected from plan:', missingFiles);

              // Create continuation for missing files
              const genMeta: GenerationMeta = {
                totalFilesPlanned: currentFilePlan.total,
                filesInThisBatch: receivedFiles,
                completedFiles: receivedFiles,
                remainingFiles: missingFiles,
                currentBatch: 1,
                totalBatches: Math.ceil(currentFilePlan.total / 5),
                isComplete: false
              };

              // Seamless progress - feels like one continuous generation
              setStreamingStatus(`✨ Generating... ${receivedFiles.length}/${currentFilePlan.total} files`);

              // Update file plan to show progress
              setFilePlan({
                create: currentFilePlan.create,
                delete: currentFilePlan.delete || [],
                total: currentFilePlan.total,
                completed: receivedFiles
              });

              const contState = {
                isActive: true,
                originalPrompt: prompt || 'Generate app',
                systemInstruction,
                generationMeta: genMeta,
                accumulatedFiles: newFiles,
                currentBatch: 1
              };
              setContinuationState(contState);
              continuationStarted = true; // Prevent finally block from clearing isGenerating

              // Continue silently - user sees only smooth progress
              setTimeout(() => {
                handleContinueGeneration(contState, existingApp ? files : undefined);
              }, 100); // Minimal delay for seamless feel

              return;
            }
          }

          // Check for smart continuation (generationMeta from AI response)
          const genMeta = parseResult.generationMeta;
          if (genMeta && !genMeta.isComplete && genMeta.remainingFiles.length > 0) {
            // Multi-batch generation detected - start continuation
            console.log('[Generation] Multi-batch generation detected:', {
              batch: `${genMeta.currentBatch}/${genMeta.totalBatches}`,
              completed: genMeta.completedFiles.length,
              remaining: genMeta.remainingFiles.length
            });

            // Seamless progress - feels like one continuous generation
            setStreamingStatus(`✨ Generating... ${genMeta.completedFiles.length}/${genMeta.totalFilesPlanned} files`);

            // Update file plan to show progress
            setFilePlan({
              create: [...genMeta.completedFiles, ...genMeta.remainingFiles],
              delete: [],
              total: genMeta.totalFilesPlanned,
              completed: genMeta.completedFiles
            });

            // Initialize continuation state
            const contState = {
              isActive: true,
              originalPrompt: prompt || 'Generate app',
              systemInstruction,
              generationMeta: genMeta,
              accumulatedFiles: newFiles,
              currentBatch: genMeta.currentBatch
            };
            setContinuationState(contState);
            continuationStarted = true; // Prevent finally block from clearing isGenerating

            // Continue silently - user sees only smooth progress
            setTimeout(() => {
              handleContinueGeneration(contState, existingApp ? files : undefined);
            }, 100); // Minimal delay for seamless feel

            return; // Don't show diff modal yet, wait for all batches
          }

          // Save to AI history (persistent)
          aiHistory.addEntry({
            timestamp: Date.now(),
            prompt: prompt || 'Generate app',
            model: currentModel,
            provider: providerName,
            hasSketch: !!sketchAtt,
            hasBrand: !!brandAtt,
            isUpdate: !!existingApp,
            rawResponse: fullText,
            responseChars: fullText.length,
            responseChunks: chunkCount,
            durationMs: Date.now() - genStartTime,
            success: true,
            truncated: parseResult.truncated,
            filesGenerated: Object.keys(newFiles),
            explanation
          });

          // Add assistant message with token usage and clear file list
          const generatedFileList = Object.keys(newFiles);

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: explanation || 'Generation complete.',
            files: newFiles,
            fileChanges,
            snapshotFiles: { ...files }, // Save state before this change for revert
            model: currentModel,
            provider: providerName,
            generationTime: Date.now() - genStartTime,
            continuation: parseResult.continuation,
            tokenUsage: streamResponse?.usage ? {
              inputTokens: streamResponse.usage.inputTokens || 0,
              outputTokens: streamResponse.usage.outputTokens || 0,
              totalTokens: (streamResponse.usage.inputTokens || 0) + (streamResponse.usage.outputTokens || 0)
            } : undefined
          };

          // IMPORTANT: Add message FIRST so user sees it in chat
          setMessages(prev => [...prev, assistantMessage]);

          // Update status to show completion
          setStreamingStatus(`✅ Generated ${generatedFileList.length} files!`);

          console.log('[Generation] Success - adding message and showing diff modal:', {
            fileCount: generatedFileList.length,
            files: generatedFileList
          });

          // Small delay to ensure message renders before modal opens
          setTimeout(() => {
            // Clear generating state
            setFilePlan(null);
            // Show diff modal
            reviewChange(existingApp ? 'Updated App' : 'Generated Initial App', mergedFiles);
          }, 150);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Parse error';
          console.error('Parse error:', errorMsg);
          console.error('Response preview:', fullText.slice(0, 500));
          console.error('Response end:', fullText.slice(-200));

          // Check if this is a truncation error
          const isTruncationError = errorMsg.includes('truncated') || errorMsg.includes('token limits');

          if (isTruncationError && fullText.length > 1000) {
            // Use the new extraction function
            const extraction = extractFilesFromTruncatedResponse(fullText, files);
            const completeCount = Object.keys(extraction.completeFiles).length;
            const partialCount = Object.keys(extraction.partialFiles).length;

            console.log('[ControlPanel] Extraction result:', {
              completeFiles: completeCount,
              partialFiles: partialCount,
              files: Object.keys(extraction.completeFiles)
            });

            if (completeCount > 0) {
              // We have some complete files!
              const recoveredFiles = { ...files, ...extraction.completeFiles };
              const recoveredFileNames = Object.keys(extraction.completeFiles);

              // Check if we have a plan and there are missing files
              if (currentFilePlan && currentFilePlan.create.length > 0) {
                const missingFromPlan = currentFilePlan.create.filter(f => !recoveredFileNames.includes(f));

                if (missingFromPlan.length > 0) {
                  // Seamless progress - user sees smooth generation
                  console.log('[Truncation] Missing files from plan:', missingFromPlan);
                  setStreamingStatus(`✨ Generating... ${completeCount}/${currentFilePlan.total} files`);

                  // Update file plan to show progress
                  setFilePlan({
                    create: currentFilePlan.create,
                    delete: currentFilePlan.delete || [],
                    total: currentFilePlan.total,
                    completed: recoveredFileNames
                  });

                  const genMeta: GenerationMeta = {
                    totalFilesPlanned: currentFilePlan.total,
                    filesInThisBatch: recoveredFileNames,
                    completedFiles: recoveredFileNames,
                    remainingFiles: missingFromPlan,
                    currentBatch: 1,
                    totalBatches: Math.ceil(currentFilePlan.total / 5),
                    isComplete: false
                  };

                  // Create continuation system instruction (original is out of scope in catch block)
                  const contSystemInstruction = `You are an expert React Developer. Continue generating the remaining files for the project.

**RESPONSE FORMAT**:
Return JSON with explanation and files:
{
  "explanation": "Brief description of what was generated",
  "files": {
    "src/path/to/file.tsx": "// complete file content"
  }
}

**CRITICAL RULES**:
- Each file MUST be COMPLETE and FUNCTIONAL
- Use Tailwind CSS for styling
- Entry point is 'src/App.tsx'
- Use relative imports (e.g., './components/Header')
- Keep files under 300 lines
- Use 'lucide-react' for icons`;

                  const contState = {
                    isActive: true,
                    originalPrompt: prompt || 'Generate app',
                    systemInstruction: contSystemInstruction,
                    generationMeta: genMeta,
                    accumulatedFiles: extraction.completeFiles,
                    currentBatch: 1
                  };
                  setContinuationState(contState);
                  continuationStarted = true; // Prevent finally block from clearing isGenerating

                  // Continue silently - user sees only smooth progress
                  setTimeout(() => {
                    handleContinueGeneration(contState, existingApp ? files : undefined);
                  }, 100);

                  return;
                }
              }

              // SUCCESS PATH: If we have all files from the plan (no missing) and no partial files,
              // just use what we recovered! Don't try to regenerate.
              if (currentFilePlan && partialCount === 0) {
                const planFileNames = currentFilePlan.create.map(f => f.split('/').pop());
                const recoveredNames = recoveredFileNames.map(f => f.split('/').pop());
                const allPlanFilesRecovered = planFileNames.every(name => recoveredNames.includes(name));

                if (allPlanFilesRecovered) {
                  console.log('[Truncation Recovery] All plan files recovered! Using them directly.', {
                    planFiles: currentFilePlan.create,
                    recoveredFiles: recoveredFileNames
                  });

                  // Show success and use the recovered files
                  setStreamingStatus(`✅ Generated ${completeCount} files!`);

                  // Calculate file changes for display
                  const recoveryFileChanges = calculateFileChanges(files, recoveredFiles);

                  // Create completion message
                  const assistantMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    timestamp: Date.now(),
                    explanation: 'Generation complete.',
                    files: extraction.completeFiles,
                    fileChanges: recoveryFileChanges,
                    snapshotFiles: { ...files },
                    model: currentModel,
                    provider: providerName,
                    generationTime: Date.now() - genStartTime,
                    tokenUsage: streamResponse?.usage ? {
                      inputTokens: streamResponse.usage.inputTokens || 0,
                      outputTokens: streamResponse.usage.outputTokens || 0,
                      totalTokens: (streamResponse.usage.inputTokens || 0) + (streamResponse.usage.outputTokens || 0)
                    } : undefined
                  };
                  setMessages(prev => [...prev, assistantMessage]);

                  // Small delay then show diff modal
                  setTimeout(() => {
                    setFilePlan(null);
                    reviewChange('Generated App', recoveredFiles);
                  }, 150);

                  return;
                }
              }

              // Check if any file content looks truncated (even if marked "complete")
              // Only do this check if we have partial files or missing files from plan
              const shouldCheckSuspicious = partialCount > 0 || (currentFilePlan && currentFilePlan.create.some(f => !recoveredFileNames.includes(f)));

              let suspiciousTruncation = false;
              if (shouldCheckSuspicious) {
                suspiciousTruncation = Object.entries(extraction.completeFiles).some(([path, content]) => {
                  // Check for unbalanced braces/brackets
                  const openBraces = (content.match(/\{/g) || []).length;
                  const closeBraces = (content.match(/\}/g) || []).length;
                  const openParens = (content.match(/\(/g) || []).length;
                  const closeParens = (content.match(/\)/g) || []).length;

                  // Check for cut-off escape sequences
                  const hasIncompleteEscape = /\\$/.test(content.trim());

                  // Check for missing closing tag in JSX files
                  const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
                  const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');

                  return (openBraces - closeBraces > 1) ||
                         (openParens - closeParens > 2) ||
                         hasIncompleteEscape ||
                         hasIncompleteJSX;
                });
              }

              // If we have a plan and files look suspicious, trigger continuation
              if (suspiciousTruncation && currentFilePlan && currentFilePlan.create.length > 0) {
                console.log('[Truncation] Files look suspiciously truncated, triggering continuation');

                // Find the specific truncated files by checking content integrity
                const truncatedFiles = Object.entries(extraction.completeFiles)
                  .filter(([path, content]) => {
                    const openBraces = (content.match(/\{/g) || []).length;
                    const closeBraces = (content.match(/\}/g) || []).length;
                    const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
                    const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');
                    return (openBraces - closeBraces > 1) || hasIncompleteJSX || /\\$/.test(content.trim());
                  })
                  .map(([path]) => path);

                // If no specific truncated files found, regenerate the last file in the plan
                const filesToRegenerate = truncatedFiles.length > 0
                  ? truncatedFiles
                  : [currentFilePlan.create[currentFilePlan.create.length - 1]];

                // Keep files that are NOT being regenerated
                const goodFiles = Object.fromEntries(
                  Object.entries(extraction.completeFiles).filter(([path]) => !filesToRegenerate.includes(path))
                );

                // Seamless progress - user sees smooth generation
                const completedCount = Object.keys(goodFiles).length;
                const totalCount = currentFilePlan.total;
                setStreamingStatus(`✨ Generating... ${completedCount}/${totalCount} files`);

                // Update file plan to show progress
                setFilePlan({
                  create: currentFilePlan.create,
                  delete: currentFilePlan.delete || [],
                  total: currentFilePlan.total,
                  completed: Object.keys(goodFiles)
                });

                // No warning message in chat - just continue silently
                continuationStarted = true; // Prevent finally block from clearing isGenerating

                // Start continuation immediately (not via setTimeout to avoid state issues)
                setIsGenerating(true);

                const continueGeneration = async () => {
                  try {
                    // Get fresh manager reference (not available from try block in catch)
                    const manager = getProviderManager();
                    const activeConfig = manager.getActiveConfig();
                    const currentModel = activeConfig?.defaultModel || selectedModel;

                    // Create continuation-specific system instruction (original is out of scope in catch block)
                    const contSystemInstruction = `You are an expert React Developer. Continue generating the remaining files for the project.

**RESPONSE FORMAT**:
Return JSON with explanation and files:
{
  "explanation": "Brief description of what was generated",
  "files": {
    "src/path/to/file.tsx": "// complete file content"
  }
}

**CRITICAL RULES**:
- Each file MUST be COMPLETE and FUNCTIONAL
- Use Tailwind CSS for styling
- Entry point is 'src/App.tsx'
- Use relative imports (e.g., './components/Header')
- Keep files under 300 lines
- Use 'lucide-react' for icons`;

                    const contPrompt = `Continue generating the remaining files.

## FILES TO GENERATE:
${filesToRegenerate.map(f => `- ${f}`).join('\n')}

## ORIGINAL REQUEST:
${prompt || 'Generate app'}

Generate ONLY these files. Each file must be COMPLETE and FUNCTIONAL.`;

                    let contFullText = '';
                    await manager.generateStream(
                      {
                        prompt: contPrompt,
                        systemInstruction: contSystemInstruction,
                        maxTokens: 32768,
                        temperature: 0.7,
                        responseFormat: 'json',
                        // Only use native schema for providers that support dynamic keys
                        responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
                          ? FILE_GENERATION_SCHEMA
                          : undefined
                      },
                      (chunk) => {
                        contFullText += chunk.text || '';
                        setStreamingChars(contFullText.length);
                        // Seamless progress - same format throughout
                        if (contFullText.length % 2000 < 100) { // Update occasionally
                          setStreamingStatus(`✨ Generating... ${completedCount}/${totalCount} files (${Math.round(contFullText.length / 1024)}KB)`);
                        }
                      },
                      currentModel
                    );

                    const contResult = parseMultiFileResponse(contFullText);

                    if (contResult && contResult.files) {
                      // Merge good files with regenerated files
                      const finalFiles = { ...goodFiles, ...contResult.files };
                      const mergedWithExisting = existingApp ? { ...files, ...finalFiles } : finalFiles;

                      setStreamingStatus(`✅ Generated ${Object.keys(finalFiles).length} files!`);

                      // Show diff modal directly - feels like one request completed
                      reviewChange('Generated App', mergedWithExisting);
                    } else {
                      throw new Error('Failed to parse continuation response');
                    }
                  } catch (contError) {
                    console.error('[Continuation] Error:', contError);
                    setStreamingStatus(`❌ Continuation failed: ${contError instanceof Error ? contError.message : 'Unknown error'}`);

                    // Show what we have so far
                    if (Object.keys(goodFiles).length > 0) {
                      const partialMerged = existingApp ? { ...files, ...goodFiles } : goodFiles;
                      reviewChange('Partial Recovery (some files missing)', partialMerged);
                    }
                  } finally {
                    setIsGenerating(false);
                    setContinuationState(null);
                    setFilePlan(null);
                  }
                };

                // Run continuation
                continueGeneration();
                return; // Don't show error, continuation will handle it
              }

              // All files look complete - show diff modal directly
              console.log('[Truncation Recovery] Using recovered files (no plan or fallback).', {
                completeFiles: completeCount,
                files: recoveredFileNames
              });

              setStreamingStatus(`✅ Generated ${completeCount} files!`);

              // Calculate file changes for display
              const truncRecoveryFileChanges = calculateFileChanges(files, recoveredFiles);

              // Add chat message showing what was generated
              const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: Date.now(),
                explanation: 'Generation complete (recovered from truncated response).',
                files: extraction.completeFiles,
                fileChanges: truncRecoveryFileChanges,
                snapshotFiles: { ...files },
                model: currentModel,
                provider: providerName,
                generationTime: Date.now() - genStartTime,
                tokenUsage: streamResponse?.usage ? {
                  inputTokens: streamResponse.usage.inputTokens || 0,
                  outputTokens: streamResponse.usage.outputTokens || 0,
                  totalTokens: (streamResponse.usage.inputTokens || 0) + (streamResponse.usage.outputTokens || 0)
                } : undefined
              };
              setMessages(prev => [...prev, assistantMessage]);

              // Small delay then show diff modal
              setTimeout(() => {
                setFilePlan(null);
                reviewChange('Generated App', recoveredFiles);
              }, 150);
              return;
            } else {
              // No complete files could be recovered
              console.log('[Truncation] No complete files recovered, checking for partial files...');
              const partialCount = Object.keys(extraction.partialFiles).length;

              if (partialCount > 0) {
                // Try to use partial files - they might be good enough
                console.log(`[Truncation] Attempting to use ${partialCount} partial files`);
                setStreamingStatus(`⚠️ Using ${partialCount} partially generated files...`);

                // Try to fix and use partial files
                const fixedPartialFiles: Record<string, string> = {};
                for (const [filePath, fileData] of Object.entries(extraction.partialFiles)) {
                  const content = typeof fileData === 'string' ? fileData : fileData.content;
                  if (content && content.length > 100) {
                    // Basic cleanup of partial content
                    let cleaned = content
                      .replace(/\\n/g, '\n')
                      .replace(/\\t/g, '\t')
                      .replace(/\\"/g, '"')
                      .replace(/\\'/g, "'")
                      .trim();

                    // Remove trailing incomplete patterns
                    cleaned = cleaned
                      .replace(/,\s*$/, '')  // Remove trailing comma
                      .replace(/[^\\]"$/, '"')  // Close unclosed string
                      .replace(/\{[^}]*$/, match => match + '\n}');  // Close unclosed object

                    if (cleaned.length > 100) {
                      fixedPartialFiles[filePath] = cleaned;
                    }
                  }
                }

                if (Object.keys(fixedPartialFiles).length > 0) {
                  console.log(`[Truncation] Successfully fixed ${Object.keys(fixedPartialFiles).length} partial files`);
                  const recoveredFiles = { ...files, ...fixedPartialFiles };
                  const partialFileChanges = calculateFileChanges(files, recoveredFiles);

                  const assistantMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    timestamp: Date.now(),
                    explanation: 'Generation incomplete (recovered partial files from truncated response).',
                    files: fixedPartialFiles,
                    fileChanges: partialFileChanges,
                    snapshotFiles: { ...files },
                    model: currentModel,
                    provider: providerName,
                    generationTime: Date.now() - genStartTime,
                    tokenUsage: streamResponse?.usage ? {
                      inputTokens: streamResponse.usage.inputTokens || 0,
                      outputTokens: streamResponse.usage.outputTokens || 0,
                      totalTokens: (streamResponse.usage.inputTokens || 0) + (streamResponse.usage.outputTokens || 0)
                    } : undefined
                  };
                  setMessages(prev => [...prev, assistantMessage]);

                  setTimeout(() => {
                    setFilePlan(null);
                    reviewChange('Generated App (Partial)', recoveredFiles);
                  }, 150);
                  return;
                }
              }

              // If we have a plan, try to continue with just what we can extract
              if (currentFilePlan && fullText.length > 5000) {
                console.log('[Truncation] Attempting aggressive extraction from long response...');
                // Try to extract any code-like content even if malformed
                const codeMatches = fullText.match(/```(?:tsx?|jsx?|typescript|javascript|js|ts)\s*\n([\s\S]*?)\n```/g);
                if (codeMatches && codeMatches.length > 0) {
                  const emergencyFiles: Record<string, string> = {};
                  let fileIndex = 1;

                  for (const match of codeMatches) {
                    const codeContent = match.replace(/```(?:tsx?|jsx?|typescript|javascript|js|ts)\s*\n?/, '').replace(/```$/, '').trim();
                    if (codeContent.length > 200) {
                      const fileName = `recovered${fileIndex}.tsx`;
                      emergencyFiles[fileName] = codeContent;
                      fileIndex++;
                    }
                  }

                  if (Object.keys(emergencyFiles).length > 0) {
                    console.log(`[Truncation] Emergency recovery: ${Object.keys(emergencyFiles).length} code blocks`);
                    const recoveredFiles = { ...files, ...emergencyFiles };
                    const emergencyFileChanges = calculateFileChanges(files, recoveredFiles);

                    const assistantMessage: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      timestamp: Date.now(),
                      explanation: `Generation was truncated but recovered ${Object.keys(emergencyFiles).length} code sections.`,
                      files: emergencyFiles,
                      fileChanges: emergencyFileChanges,
                      snapshotFiles: { ...files },
                      model: currentModel,
                      provider: providerName,
                      generationTime: Date.now() - genStartTime,
                      tokenUsage: streamResponse?.usage ? {
                        inputTokens: streamResponse.usage.inputTokens || 0,
                        outputTokens: streamResponse.usage.outputTokens || 0,
                        totalTokens: (streamResponse.usage.inputTokens || 0) + (streamResponse.usage.outputTokens || 0)
                      } : undefined
                    };
                    setMessages(prev => [...prev, assistantMessage]);

                    setTimeout(() => {
                      setFilePlan(null);
                      reviewChange('Generated App (Recovered)', recoveredFiles);
                    }, 150);
                    return;
                  }
                }
              }

              // Last resort: show error
              setStreamingStatus('❌ Generation incomplete. Please try again.');
            }
          } else {
            setStreamingStatus('❌ ' + errorMsg);
          }

          debugLog.error('generation', errorMsg, {
            id: genRequestId,
            model: currentModel,
            duration: Date.now() - genStartTime,
            response: fullText.slice(0, 1000) + '\n...\n' + fullText.slice(-500),
            metadata: {
              mode: 'generator',
              totalChunks: chunkCount,
              totalChars: fullText.length,
              provider: providerName,
              hint: 'Check window.__lastAIResponse in console for full response',
              hasTruncationError: isTruncationError,
              partialFilesFound: isTruncationError ? Object.keys(truncatedContent?.partialFiles || {}).length : 0
            }
          });

          // Save failed attempt to AI history
          aiHistory.addEntry({
            timestamp: Date.now(),
            prompt: prompt || 'Generate app',
            model: currentModel,
            provider: providerName,
            hasSketch: !!sketchAtt,
            hasBrand: !!brandAtt,
            isUpdate: !!existingApp,
            rawResponse: fullText,
            responseChars: fullText.length,
            responseChunks: chunkCount,
            durationMs: Date.now() - genStartTime,
            success: false,
            error: errorMsg,
            truncated: true
          });

          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            error: errorMsg + ' (Check browser console for raw response)',
            snapshotFiles: { ...files }
          };
          setMessages(prev => [...prev, errorMessage]);
        }
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
      {showResetConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-950/98 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-white/10 bg-red-500/5">
              <div className="p-2 bg-red-500/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Start Fresh?</h3>
                <p className="text-sm text-slate-400">This action cannot be undone</p>
              </div>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">
                Starting fresh will clear the following:
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <MessageSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Chat History</p>
                    <p className="text-xs text-slate-500">All messages and conversation context</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <FileCode className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Generated Code</p>
                    <p className="text-xs text-slate-500">All files and the preview will be cleared</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <History className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Version History</p>
                    <p className="text-xs text-slate-500">All undo/redo states will be lost</p>
                  </div>
                </div>
              </div>

              {/* Uncommitted Changes Warning */}
              {currentProject && hasUncommittedChanges && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Uncommitted Changes</p>
                      <p className="text-xs text-amber-400/80 mt-1">
                        You have unsaved changes in project "{currentProject.name}".
                        These changes will be lost if you reset.
                      </p>
                      <button
                        onClick={() => {
                          setShowResetConfirm(false);
                          onOpenGitTab?.();
                        }}
                        className="text-xs text-amber-300 hover:text-amber-200 underline mt-2"
                      >
                        Review changes in Git tab
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-5 border-t border-white/10 bg-slate-900/30">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Yes, Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

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
            const generatedFileList = Object.keys(generatedFiles);

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
            llmContent: llmMessage
          };
          setMessages(prev => [...prev, syncMessage]);

          // If this is the last batch, add an AI acknowledgment
          if (batchIndex === totalBatches - 1) {
            const totalFiles = Object.keys(files).length;
            const ackMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              timestamp: Date.now(),
              explanation: `✅ **Codebase synced successfully!**\n\nI now have the complete and up-to-date view of your project (${totalFiles} files). I'll use this as the reference for all future requests.\n\nFeel free to ask me to make changes or improvements!`
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
