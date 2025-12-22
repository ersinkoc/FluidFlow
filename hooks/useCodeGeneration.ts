/**
 * useCodeGeneration Hook
 *
 * Handles the main code generation logic for the AI chat.
 * Orchestrates streaming, parsing, and continuation handling.
 */

import { useCallback } from 'react';
import { FileSystem, ChatMessage, ChatAttachment } from '../types';
import { GenerationMeta } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { getProviderManager, GenerationRequest, GenerationResponse } from '../services/ai';
import {
  FILE_GENERATION_SCHEMA,
  supportsAdditionalProperties,
} from '../services/ai/utils/schemas';
import {
  CONTINUATION_SYSTEM_INSTRUCTION,
  CONTINUATION_SYSTEM_INSTRUCTION_MARKER,
} from '../components/ControlPanel/prompts';
import { checkAndAutoCompact } from '../services/contextCompaction';
import { FilePlan, TruncatedContent, ContinuationState, FileProgress } from './useGenerationState';
import { useStreamingResponse } from './useStreamingResponse';
import { useResponseParser } from './useResponseParser';
import {
  calculateFileChanges,
  createTokenUsage,
  buildSystemInstruction,
  buildPromptParts,
} from '../utils/generationUtils';
import {
  analyzeTruncatedResponse,
  emergencyCodeBlockExtraction,
} from '../utils/truncationRecovery';
import { getFluidFlowConfig } from '../services/fluidflowConfig';

export interface CodeGenerationOptions {
  prompt: string;
  attachments: ChatAttachment[];
  isEducationMode: boolean;
  diffModeEnabled?: boolean;
  conversationHistory?: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export interface CodeGenerationResult {
  success: boolean;
  continuationStarted?: boolean;
  error?: string;
}

export interface AIHistoryEntry {
  timestamp: number;
  prompt: string;
  model: string;
  provider: string;
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  durationMs: number;
  success: boolean;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  error?: string;
}

export interface UseCodeGenerationOptions {
  files: FileSystem;
  selectedModel: string;
  sessionId?: string;  // For context compaction
  generateSystemInstruction: () => string;
  setStreamingStatus: (status: string) => void;
  setStreamingChars: (chars: number) => void;
  setStreamingFiles: (files: string[]) => void;
  setFilePlan: (plan: FilePlan | null) => void;
  setContinuationState: (state: ContinuationState | null) => void;
  setTruncatedContent: (content: TruncatedContent | null) => void;
  setIsGenerating: (value: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  reviewChange: (label: string, newFiles: FileSystem, options?: { skipHistory?: boolean; incompleteFiles?: string[] }) => void;
  handleContinueGeneration: (
    state?: ContinuationState,
    originalFiles?: FileSystem
  ) => Promise<void>;
  addAIHistoryEntry: (entry: AIHistoryEntry) => void;
  // File progress tracking callbacks (optional)
  updateFileProgress?: (path: string, updates: Partial<FileProgress>) => void;
  initFileProgressFromPlan?: (plan: FilePlan) => void;
  setFileProgress?: (progress: Map<string, FileProgress>) => void;
}

export interface UseCodeGenerationReturn {
  generateCode: (options: CodeGenerationOptions) => Promise<CodeGenerationResult>;
}

export function useCodeGeneration(options: UseCodeGenerationOptions): UseCodeGenerationReturn {
  const {
    files,
    selectedModel,
    sessionId,
    generateSystemInstruction,
    setStreamingStatus,
    setStreamingChars,
    setStreamingFiles,
    setFilePlan,
    setContinuationState,
    setTruncatedContent: _setTruncatedContent,
    setIsGenerating: _setIsGenerating,
    setMessages,
    reviewChange,
    handleContinueGeneration,
    addAIHistoryEntry,
    updateFileProgress,
    initFileProgressFromPlan,
    setFileProgress,
  } = options;

  const existingApp = files['src/App.tsx'];

  // Use extracted hooks
  const { processStreamingResponse } = useStreamingResponse({
    setStreamingChars,
    setStreamingFiles,
    setStreamingStatus,
    setFilePlan,
    updateFileProgress,
    initFileProgressFromPlan,
  });

  const { parseStandardResponse, parseSearchReplaceResponse } = useResponseParser({
    files,
    existingApp: !!existingApp,
    setStreamingStatus,
  });

  /**
   * Handle generation success - create message and show diff modal
   */
  const handleGenerationSuccess = useCallback(
    (
      newFiles: Record<string, string>,
      mergedFiles: FileSystem,
      explanation: string,
      genStartTime: number,
      currentModel: string,
      providerName: string,
      streamResponse: GenerationResponse | null,
      fullText: string,
      continuation?: { prompt: string; remainingFiles: string[]; currentBatch: number; totalBatches: number },
      incompleteFiles?: string[]
    ) => {
      const fileChanges = calculateFileChanges(files, mergedFiles);
      const generatedFileList = Object.keys(newFiles);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        explanation: explanation || 'Generation complete.',
        files: newFiles,
        fileChanges,
        snapshotFiles: { ...files },
        model: currentModel,
        provider: providerName,
        generationTime: Date.now() - genStartTime,
        continuation: continuation,
        tokenUsage: createTokenUsage(streamResponse?.usage, undefined, fullText, newFiles),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Check if context needs compaction and trigger based on settings
      if (sessionId) {
        checkAndAutoCompact(sessionId).then(result => {
          if (result) {
            if (result.compacted) {
              console.log('[useCodeGeneration] Context compacted:', result);
              setMessages((prev) => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: Date.now(),
                content: `📦 Context compacted: ${result.beforeTokens.toLocaleString()} → ${result.afterTokens.toLocaleString()} tokens`,
              }]);
            }
          }
        }).catch(err => {
          console.error('[useCodeGeneration] Compaction check failed:', err);
        });
      }

      // Show warning if there are incomplete files
      if (incompleteFiles && incompleteFiles.length > 0) {
        setStreamingStatus(`⚠️ Generated ${generatedFileList.length} files (${incompleteFiles.length} incomplete, excluded)`);
      } else {
        setStreamingStatus(`✅ Generated ${generatedFileList.length} files!`);
      }

      console.log('[Generation] Success - adding message and showing diff modal:', {
        fileCount: generatedFileList.length,
        files: generatedFileList,
        incompleteFiles,
      });

      setTimeout(() => {
        setFilePlan(null);
        reviewChange(
          existingApp ? 'Updated App' : 'Generated Initial App',
          mergedFiles,
          { incompleteFiles }
        );
      }, 150);
    },
    [files, existingApp, setMessages, setStreamingStatus, setFilePlan, reviewChange, sessionId]
  );

  /**
   * Handle missing files - trigger continuation
   */
  const handleMissingFiles = useCallback(
    (
      currentFilePlan: FilePlan,
      newFiles: Record<string, string>,
      prompt: string,
      systemInstruction: string
    ): boolean => {
      const receivedFiles = Object.keys(newFiles);
      const missingFiles = currentFilePlan.create.filter((f) => !receivedFiles.includes(f));

      if (missingFiles.length === 0) return false;

      console.log('[Generation] Missing files detected from plan:', missingFiles);

      const genMeta: GenerationMeta = {
        totalFilesPlanned: currentFilePlan.total,
        filesInThisBatch: receivedFiles,
        completedFiles: receivedFiles,
        remainingFiles: missingFiles,
        currentBatch: 1,
        totalBatches: Math.ceil(currentFilePlan.total / 5),
        isComplete: false,
      };

      setStreamingStatus(`✨ Generating... ${receivedFiles.length}/${currentFilePlan.total} files`);

      setFilePlan({
        create: currentFilePlan.create,
        delete: currentFilePlan.delete || [],
        total: currentFilePlan.total,
        completed: receivedFiles,
      });

      const contState: ContinuationState = {
        isActive: true,
        originalPrompt: prompt || 'Generate app',
        systemInstruction,
        generationMeta: genMeta,
        accumulatedFiles: newFiles,
        currentBatch: 1,
      };
      setContinuationState(contState);

      setTimeout(() => {
        handleContinueGeneration(contState, existingApp ? files : undefined);
      }, 100);

      return true;
    },
    [files, existingApp, setStreamingStatus, setFilePlan, setContinuationState, handleContinueGeneration]
  );

  /**
   * Handle smart continuation from AI response metadata
   */
  const handleSmartContinuation = useCallback(
    (
      generationMeta: GenerationMeta,
      newFiles: Record<string, string>,
      prompt: string,
      systemInstruction: string
    ): boolean => {
      if (generationMeta.isComplete || generationMeta.remainingFiles.length === 0) {
        return false;
      }

      console.log('[Generation] Multi-batch generation detected:', {
        batch: `${generationMeta.currentBatch}/${generationMeta.totalBatches}`,
        completed: generationMeta.completedFiles.length,
        remaining: generationMeta.remainingFiles.length,
      });

      setStreamingStatus(
        `✨ Generating... ${generationMeta.completedFiles.length}/${generationMeta.totalFilesPlanned} files`
      );

      setFilePlan({
        create: [...generationMeta.completedFiles, ...generationMeta.remainingFiles],
        delete: [],
        total: generationMeta.totalFilesPlanned,
        completed: generationMeta.completedFiles,
      });

      const contState: ContinuationState = {
        isActive: true,
        originalPrompt: prompt || 'Generate app',
        systemInstruction,
        generationMeta,
        accumulatedFiles: newFiles,
        currentBatch: generationMeta.currentBatch,
      };
      setContinuationState(contState);

      setTimeout(() => {
        handleContinueGeneration(contState, existingApp ? files : undefined);
      }, 100);

      return true;
    },
    [files, existingApp, setStreamingStatus, setFilePlan, setContinuationState, handleContinueGeneration]
  );

  /**
   * Handle truncation error - try to recover files using utility
   */
  const handleTruncationError = useCallback(
    async (
      fullText: string,
      currentFilePlan: FilePlan | null,
      prompt: string,
      currentModel: string,
      providerName: string,
      genStartTime: number,
      streamResponse: GenerationResponse | null
    ): Promise<{ handled: boolean; continuationStarted: boolean }> => {
      // Use utility to analyze truncated response
      const result = analyzeTruncatedResponse(
        fullText,
        files,
        currentFilePlan ? { create: currentFilePlan.create, delete: currentFilePlan.delete || [], total: currentFilePlan.total } : null
      );

      console.log('[Truncation Recovery] Analysis result:', result.action);

      if (result.action === 'none') {
        // Try emergency code block extraction as last resort
        const emergencyFiles = emergencyCodeBlockExtraction(fullText);
        if (emergencyFiles) {
          console.log(`[Truncation] Emergency recovery: ${Object.keys(emergencyFiles).length} code blocks`);
          const recoveredFiles = { ...files, ...emergencyFiles };

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: `Generation was truncated but recovered ${Object.keys(emergencyFiles).length} code sections.`,
            files: emergencyFiles,
            fileChanges: calculateFileChanges(files, recoveredFiles),
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName,
            generationTime: Date.now() - genStartTime,
            tokenUsage: createTokenUsage(streamResponse?.usage, undefined, fullText, emergencyFiles),
          };
          setMessages((prev) => [...prev, assistantMessage]);

          setTimeout(() => {
            setFilePlan(null);
            reviewChange('Generated App (Recovered)', recoveredFiles);
          }, 150);

          return { handled: true, continuationStarted: false };
        }
        return { handled: false, continuationStarted: false };
      }

      if (result.action === 'continuation' && result.generationMeta) {
        setStreamingStatus(`✨ ${result.message}`);

        if (currentFilePlan) {
          setFilePlan({
            create: currentFilePlan.create,
            delete: currentFilePlan.delete || [],
            total: currentFilePlan.total,
            completed: result.generationMeta.completedFiles,
          });
        }

        // Use format-aware continuation instruction
        const currentResponseFormat = getFluidFlowConfig().getResponseFormat();
        const continuationInstruction = currentResponseFormat === 'marker'
          ? CONTINUATION_SYSTEM_INSTRUCTION_MARKER
          : CONTINUATION_SYSTEM_INSTRUCTION;

        const contState: ContinuationState = {
          isActive: true,
          originalPrompt: prompt || 'Generate app',
          systemInstruction: continuationInstruction,
          generationMeta: result.generationMeta,
          accumulatedFiles: result.recoveredFiles || {},
          currentBatch: 1,
        };
        setContinuationState(contState);

        setTimeout(() => {
          handleContinueGeneration(contState, existingApp ? files : undefined);
        }, 100);

        return { handled: true, continuationStarted: true };
      }

      if (result.action === 'success' || result.action === 'partial') {
        const recoveredFiles = result.recoveredFiles || {};
        const mergedFiles = { ...files, ...recoveredFiles };

        setStreamingStatus(`✅ ${result.message}`);

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation: result.action === 'partial'
            ? 'Generation incomplete (recovered partial files).'
            : 'Generation complete.',
          files: recoveredFiles,
          fileChanges: calculateFileChanges(files, mergedFiles),
          snapshotFiles: { ...files },
          model: currentModel,
          provider: providerName,
          generationTime: Date.now() - genStartTime,
          tokenUsage: createTokenUsage(streamResponse?.usage, undefined, fullText, recoveredFiles),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        setTimeout(() => {
          setFilePlan(null);
          reviewChange(result.action === 'partial' ? 'Generated App (Partial)' : 'Generated App', mergedFiles);
        }, 150);

        return { handled: true, continuationStarted: false };
      }

      return { handled: false, continuationStarted: false };
    },
    [files, existingApp, setStreamingStatus, setFilePlan, setMessages, setContinuationState, reviewChange, handleContinueGeneration]
  );

  /**
   * Main code generation function
   */
  const generateCode = useCallback(
    async (genOptions: CodeGenerationOptions): Promise<CodeGenerationResult> => {
      const { prompt, attachments, isEducationMode, diffModeEnabled, conversationHistory } = genOptions;

      const sketchAtt = attachments.find((a) => a.type === 'sketch');
      const brandAtt = attachments.find((a) => a.type === 'brand');

      const manager = getProviderManager();
      const activeProvider = manager.getActiveConfig();
      const currentModel = activeProvider?.defaultModel || selectedModel;
      const providerName = activeProvider?.name || 'AI';

      // Build system instruction with configured response format
      const responseFormat = getFluidFlowConfig().getResponseFormat();
      console.log(`[CodeGeneration] Using response format: ${responseFormat}`);

      const systemInstruction = buildSystemInstruction(
        !!existingApp,
        !!brandAtt,
        isEducationMode,
        !!diffModeEnabled,
        generateSystemInstruction(),
        responseFormat
      );

      // Build prompt parts
      const { promptParts, images } = buildPromptParts(prompt, attachments, files, !!existingApp);

      const request: GenerationRequest = {
        prompt: promptParts.join('\n\n'),
        systemInstruction,
        images,
        responseFormat: responseFormat === 'marker' ? undefined : 'json',
        responseSchema:
          responseFormat !== 'marker' && activeProvider?.type && supportsAdditionalProperties(activeProvider.type)
            ? FILE_GENERATION_SCHEMA
            : undefined,
        conversationHistory:
          conversationHistory && conversationHistory.length > 0 ? conversationHistory : undefined,
      };

      // Initialize streaming state
      setStreamingStatus(`🚀 Starting generation with ${providerName}...`);
      setStreamingChars(0);
      setStreamingFiles([]);
      setFilePlan(null);
      // Clear file progress from previous generation
      if (setFileProgress) {
        setFileProgress(new Map());
      }

      const genRequestId = debugLog.request('generation', {
        model: currentModel,
        prompt: prompt || 'Generate/Update app',
        systemInstruction,
        attachments: attachments.map((a) => ({ type: a.type, size: a.file.size })),
        metadata: {
          mode: 'generator',
          hasExistingApp: !!existingApp,
          provider: providerName,
        },
      });
      const genStartTime = Date.now();

      try {
        // Process streaming response
        // Pass expected format for early validation (abort if mismatch)
        const expectedFormat = responseFormat === 'marker' ? 'marker' : undefined;
        const { fullText, chunkCount, detectedFiles, streamResponse, currentFilePlan } =
          await processStreamingResponse(request, currentModel, genRequestId, genStartTime, expectedFormat);

        // Show parsing status
        setStreamingStatus(`✨ Processing ${detectedFiles.length} files...`);

        // Parse response based on mode
        let explanation: string;
        let mergedFiles: FileSystem;
        let newFiles: Record<string, string>;
        let wasTruncated = false;
        let generationMeta: GenerationMeta | undefined;
        let incompleteFiles: string[] | undefined;
        let continuation:
          | {
              prompt: string;
              remainingFiles: string[];
              currentBatch: number;
              totalBatches: number;
            }
          | undefined;

        if (diffModeEnabled && existingApp) {
          // SEARCH/REPLACE MODE (BETA)
          const srResult = parseSearchReplaceResponse(
            fullText,
            genRequestId,
            genStartTime,
            currentModel,
            providerName,
            chunkCount
          );

          if (srResult) {
            explanation = srResult.explanation;
            newFiles = srResult.newFiles;
            mergedFiles = srResult.mergedFiles;
          } else {
            // Fallback to standard parsing
            const stdResult = parseStandardResponse(
              fullText,
              genRequestId,
              genStartTime,
              currentModel,
              providerName,
              chunkCount
            );
            explanation = stdResult.explanation;
            newFiles = stdResult.newFiles;
            mergedFiles = stdResult.mergedFiles;
            wasTruncated = stdResult.wasTruncated;
            generationMeta = stdResult.generationMeta;
            continuation = stdResult.continuation;
            incompleteFiles = stdResult.incompleteFiles;
          }
        } else {
          // Standard full-file mode
          const stdResult = parseStandardResponse(
            fullText,
            genRequestId,
            genStartTime,
            currentModel,
            providerName,
            chunkCount
          );
          explanation = stdResult.explanation;
          newFiles = stdResult.newFiles;
          mergedFiles = stdResult.mergedFiles;
          wasTruncated = stdResult.wasTruncated;
          generationMeta = stdResult.generationMeta;
          continuation = stdResult.continuation;
          incompleteFiles = stdResult.incompleteFiles;
        }

        // Check for missing files based on filePlan
        if (currentFilePlan && currentFilePlan.create.length > 0) {
          if (handleMissingFiles(currentFilePlan, newFiles, prompt, systemInstruction)) {
            return { success: true, continuationStarted: true };
          }
        }

        // Check for smart continuation
        if (generationMeta && !generationMeta.isComplete && generationMeta.remainingFiles.length > 0) {
          if (handleSmartContinuation(generationMeta, newFiles, prompt, systemInstruction)) {
            return { success: true, continuationStarted: true };
          }
        }

        // Save to AI history
        addAIHistoryEntry({
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
          truncated: wasTruncated,
          filesGenerated: Object.keys(newFiles),
          explanation,
        });

        // Handle success
        handleGenerationSuccess(
          newFiles,
          mergedFiles,
          explanation,
          genStartTime,
          currentModel,
          providerName,
          streamResponse,
          fullText,
          continuation,
          incompleteFiles
        );

        return { success: true, continuationStarted: false };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Parse error';
        console.error('Parse error:', errorMsg);

        // Check if this is a truncation error
        const isTruncationError =
          errorMsg.includes('truncated') || errorMsg.includes('token limits');

        if (isTruncationError) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lastResponse = (window as any).__lastAIResponse;
          const fullText = lastResponse?.raw || '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const currentFilePlan = (window as any).__currentFilePlan || null;

          const truncResult = await handleTruncationError(
            fullText,
            currentFilePlan,
            prompt,
            currentModel,
            providerName,
            genStartTime,
            null
          );

          if (truncResult.handled) {
            return { success: true, continuationStarted: truncResult.continuationStarted };
          }
        }

        // Log error
        debugLog.error('generation', errorMsg, {
          model: currentModel,
          duration: Date.now() - genStartTime,
          metadata: {
            mode: 'generator',
            provider: providerName,
            hasTruncationError: isTruncationError,
          },
        });

        // Save failed attempt to AI history
        addAIHistoryEntry({
          timestamp: Date.now(),
          prompt: prompt || 'Generate app',
          model: currentModel,
          provider: providerName,
          hasSketch: !!sketchAtt,
          hasBrand: !!brandAtt,
          isUpdate: !!existingApp,
          rawResponse: '',
          responseChars: 0,
          responseChunks: 0,
          durationMs: Date.now() - genStartTime,
          success: false,
          error: errorMsg,
          truncated: isTruncationError,
        });

        setStreamingStatus('❌ ' + errorMsg);

        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          error: errorMsg + ' (Check browser console for raw response)',
          snapshotFiles: { ...files },
        };
        setMessages((prev) => [...prev, errorMessage]);

        return { success: false, continuationStarted: false, error: errorMsg };
      }
    },
    [
      files,
      existingApp,
      selectedModel,
      generateSystemInstruction,
      setStreamingStatus,
      setStreamingChars,
      setStreamingFiles,
      setFilePlan,
      setFileProgress,
      setMessages,
      processStreamingResponse,
      parseStandardResponse,
      parseSearchReplaceResponse,
      handleMissingFiles,
      handleSmartContinuation,
      handleTruncationError,
      handleGenerationSuccess,
      addAIHistoryEntry,
    ]
  );

  return {
    generateCode,
  };
}
