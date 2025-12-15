/**
 * useStreamingResponse Hook
 *
 * Handles streaming AI responses and file detection during generation.
 * Extracted from useCodeGeneration to reduce complexity.
 */

import { useCallback } from 'react';
import { debugLog } from './useDebugStore';
import { getProviderManager, GenerationRequest, GenerationResponse } from '../services/ai';
import { FilePlan } from './useGenerationState';

export interface StreamingCallbacks {
  setStreamingChars: (chars: number) => void;
  setStreamingFiles: (files: string[]) => void;
  setStreamingStatus: (status: string) => void;
  setFilePlan: (plan: FilePlan | null) => void;
}

export interface StreamingResult {
  fullText: string;
  chunkCount: number;
  detectedFiles: string[];
  streamResponse: GenerationResponse | null;
  currentFilePlan: FilePlan | null;
}

export interface UseStreamingResponseReturn {
  processStreamingResponse: (
    request: GenerationRequest,
    currentModel: string,
    genRequestId: string,
    genStartTime: number
  ) => Promise<StreamingResult>;
}

/**
 * Parse file plan from streaming response
 * Extracts planned files from the // PLAN: comment at the start of AI response
 */
export function parseFilePlanFromStream(
  fullText: string
): { create: string[]; delete: string[]; total: number; completed: string[] } | null {
  // More robust regex to capture JSON with nested arrays
  const planLineMatch = fullText.match(/\/\/\s*PLAN:\s*(\{.+)/);
  if (!planLineMatch) return null;

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
      return {
        create: allFiles, // All files to generate (both new and updates)
        delete: plan.delete || [],
        total: plan.total || allFiles.length, // Fallback to calculated count
        completed: [],
      };
    }
  } catch {
    // Plan not complete yet or malformed - try regex extraction as fallback
    const createMatch = fullText.match(/"create"\s*:\s*\[([^\]]*)\]/);
    const updateMatch = fullText.match(/"update"\s*:\s*\[([^\]]*)\]/);

    if (createMatch || updateMatch) {
      const extractFiles = (match: RegExpMatchArray | null) => {
        if (!match) return [];
        return match[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, '')) || [];
      };

      const createFiles = extractFiles(createMatch);
      const updateFiles = extractFiles(updateMatch);
      const allFiles = [...createFiles, ...updateFiles];

      if (allFiles.length > 0) {
        return {
          create: allFiles,
          delete: [],
          total: allFiles.length,
          completed: [],
        };
      }
    }
  }

  return null;
}

export function useStreamingResponse(callbacks: StreamingCallbacks): UseStreamingResponseReturn {
  const { setStreamingChars, setStreamingFiles, setStreamingStatus, setFilePlan } = callbacks;

  /**
   * Process streaming response and detect files as they appear
   */
  const processStreamingResponse = useCallback(
    async (
      request: GenerationRequest,
      currentModel: string,
      genRequestId: string,
      _genStartTime: number
    ): Promise<StreamingResult> => {
      const manager = getProviderManager();
      let fullText = '';
      let detectedFiles: string[] = [];
      let chunkCount = 0;
      let streamResponse: GenerationResponse | null = null;
      let currentFilePlan: FilePlan | null = null;
      let planParsed = false;

      // Create initial stream log entry
      const streamLogId = `stream-${genRequestId}`;
      debugLog.stream('generation', {
        id: streamLogId,
        model: currentModel,
        response: 'Streaming started...',
        metadata: { chunkCount: 0, totalChars: 0, filesDetected: 0, status: 'streaming' },
      });

      // Use streaming API
      streamResponse = await manager.generateStream(
        request,
        (chunk) => {
          const chunkText = chunk.text || '';
          fullText += chunkText;
          chunkCount++;
          setStreamingChars(fullText.length);

          // Try to parse file plan from the start of response
          if (!planParsed && fullText.length > 50) {
            const parsedPlan = parseFilePlanFromStream(fullText);
            if (parsedPlan) {
              currentFilePlan = parsedPlan;
              setFilePlan(currentFilePlan);
              planParsed = true;
              console.log('[Stream] File plan detected:', currentFilePlan);
              const createCount = parsedPlan.create.length;
              setStreamingStatus(`📋 Plan: ${parsedPlan.total} files (${createCount} to generate)`);
            }
          }

          // Update the stream log every 50 chunks
          if (chunkCount % 50 === 0) {
            try {
              debugLog.streamUpdate(streamLogId, {
                response: `Streaming... ${Math.round(fullText.length / 1024)}KB received`,
                metadata: {
                  chunkCount,
                  totalChars: fullText.length,
                  filesDetected: detectedFiles.length,
                  status: 'streaming',
                },
              });
            } catch (e) {
              console.debug('[Debug] Stream update failed:', e);
            }
          }

          // Try to detect file paths as they appear
          const fileMatches = fullText.match(/"([^"]+\.(tsx?|jsx?|css|json|md|sql))"\s*:/g);
          if (fileMatches) {
            const newMatchedFiles = fileMatches
              .map((m) => m.replace(/[":\s]/g, ''))
              .filter((f) => !detectedFiles.includes(f) && !f.includes('\\'));
            if (newMatchedFiles.length > 0) {
              detectedFiles = [...detectedFiles, ...newMatchedFiles];
              setStreamingFiles([...detectedFiles]);

              // Update completed files in plan
              if (currentFilePlan) {
                const plan = currentFilePlan;
                plan.completed = detectedFiles.filter((f) => plan.create.includes(f));
                setFilePlan({ ...plan });

                // Show different status based on completion
                if (currentFilePlan.completed.length >= currentFilePlan.total) {
                  setStreamingStatus(`✅ ${currentFilePlan.total} files received, finalizing...`);
                } else {
                  setStreamingStatus(
                    `📁 ${currentFilePlan.completed.length}/${currentFilePlan.total} files received`
                  );
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

      // Mark stream as complete
      console.log('[Generation] Stream complete:', {
        chars: fullText.length,
        chunks: chunkCount,
        filesDetected: detectedFiles.length,
      });

      try {
        debugLog.streamUpdate(
          streamLogId,
          {
            response: `Completed: ${Math.round(fullText.length / 1024)}KB, ${chunkCount} chunks`,
            metadata: {
              chunkCount,
              totalChars: fullText.length,
              filesDetected: detectedFiles.length,
              status: 'complete',
            },
          },
          true
        );
      } catch (e) {
        console.debug('[Debug] Final stream update failed:', e);
      }

      // Save raw response for debugging
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__lastAIResponse = {
          raw: fullText,
          timestamp: Date.now(),
          chars: fullText.length,
          filesDetected: detectedFiles,
        };
        console.log('[Debug] Raw response saved to window.__lastAIResponse (' + fullText.length + ' chars)');
      } catch (e) {
        console.debug('[Debug] Could not save raw response:', e);
      }

      return { fullText, chunkCount, detectedFiles, streamResponse, currentFilePlan };
    },
    [setStreamingChars, setStreamingFiles, setFilePlan, setStreamingStatus]
  );

  return { processStreamingResponse };
}
