/**
 * Batch Generation Service
 *
 * Handles multi-batch code generation for large projects.
 * Uses the unified AI response parser for robust format handling.
 *
 * Features:
 * - Auto-detection of response format (JSON v1/v2, Marker v1/v2)
 * - Automatic truncation recovery
 * - Batch continuation prompts
 * - Progress tracking
 * - Error recovery
 */

import { getProviderManager } from './ai';
import { FileSystem } from '../types';
import { parseAIResponse, getBatchContinuationPrompt, type ParseResult } from '../utils/aiResponseParser';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from './ai/utils/schemas';
import { getFluidFlowConfig } from './fluidflowConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface BatchGenerationOptions {
  /** Maximum files per batch (default: 5) */
  maxFilesPerBatch?: number;
  /** Maximum tokens per batch (default: 8192) */
  maxTokensPerBatch?: number;
  /** Maximum retry attempts per batch (default: 2) */
  maxRetries?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number, currentBatch: number, totalBatches: number) => void;
  /** Batch complete callback */
  onBatchComplete?: (batchFiles: FileSystem, batchNumber: number, parseResult: ParseResult) => void;
  /** Error callback */
  onError?: (error: Error, batchNumber: number) => void;
  /** Use marker format instead of JSON */
  useMarkerFormat?: boolean;
}

export interface BatchResult {
  success: boolean;
  files: FileSystem;
  completedBatches: number;
  totalBatches: number;
  error?: string;
  /** Parse results from all batches */
  parseResults?: ParseResult[];
  /** Files that couldn't be generated */
  failedFiles?: string[];
  /** Files recovered from truncation */
  recoveredFiles?: string[];
}

interface BatchGenerateResult {
  success: boolean;
  files?: FileSystem;
  response?: string;
  parseResult?: ParseResult;
  truncated?: boolean;
  error?: string;
  remainingFiles?: string[];
}

// ============================================================================
// BATCH GENERATOR
// ============================================================================

export class BatchGenerator {
  private provider = getProviderManager();

  private defaultOptions: Required<BatchGenerationOptions> = {
    maxFilesPerBatch: 5,
    maxTokensPerBatch: 8192,
    maxRetries: 2,
    onProgress: () => {},
    onBatchComplete: () => {},
    onError: () => {},
    useMarkerFormat: false,
  };

  /**
   * Generate files in batches
   */
  async generateInBatches(
    prompt: string,
    systemInstruction: string,
    allFiles: string[],
    options: BatchGenerationOptions = {}
  ): Promise<BatchResult> {
    const opts = { ...this.defaultOptions, ...options };
    const completedFiles: FileSystem = {};
    const parseResults: ParseResult[] = [];
    const failedFiles: string[] = [];
    const recoveredFiles: string[] = [];
    let currentBatchNum = 0;
    const totalBatches = Math.ceil(allFiles.length / opts.maxFilesPerBatch);

    console.log(`[BatchGenerator] Starting batch generation: ${allFiles.length} files in ${totalBatches} batches`);

    // First batch - try to generate all files
    const firstBatchResult = await this.generateBatch(
      prompt,
      systemInstruction,
      allFiles,
      [],
      0,
      opts
    );

    if (firstBatchResult.parseResult) {
      parseResults.push(firstBatchResult.parseResult);

      if (firstBatchResult.parseResult.recoveredFiles) {
        recoveredFiles.push(...firstBatchResult.parseResult.recoveredFiles);
      }
    }

    if (!firstBatchResult.success) {
      // First batch failed completely
      opts.onError(new Error(firstBatchResult.error || 'First batch failed'), 1);
      return {
        success: false,
        files: {},
        completedBatches: 0,
        totalBatches,
        error: firstBatchResult.error,
        parseResults,
        failedFiles: allFiles,
      };
    }

    // Add files from first batch
    if (firstBatchResult.files) {
      Object.assign(completedFiles, firstBatchResult.files);
    }
    currentBatchNum = 1;

    // Check if we need more batches
    const remainingFiles = firstBatchResult.remainingFiles ||
      allFiles.filter(f => !completedFiles[f]);

    if (remainingFiles.length > 0) {
      console.log(`[BatchGenerator] First batch incomplete. Remaining: ${remainingFiles.length} files`);

      // Continue with remaining batches
      const continuationResult = await this.handleRemainingBatches(
        prompt,
        systemInstruction,
        completedFiles,
        remainingFiles,
        currentBatchNum,
        opts,
        parseResults,
        failedFiles,
        recoveredFiles
      );

      return {
        success: continuationResult.success,
        files: completedFiles,
        completedBatches: continuationResult.completedBatches,
        totalBatches: Math.max(totalBatches, continuationResult.totalBatches),
        error: continuationResult.error,
        parseResults,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
        recoveredFiles: recoveredFiles.length > 0 ? recoveredFiles : undefined,
      };
    }

    // First batch was complete
    opts.onBatchComplete(completedFiles, 1, firstBatchResult.parseResult!);

    return {
      success: true,
      files: completedFiles,
      completedBatches: 1,
      totalBatches: 1,
      parseResults,
      recoveredFiles: recoveredFiles.length > 0 ? recoveredFiles : undefined,
    };
  }

  /**
   * Handle remaining batches after initial batch
   */
  private async handleRemainingBatches(
    originalPrompt: string,
    systemInstruction: string,
    completedFiles: FileSystem,
    initialRemaining: string[],
    startBatchNum: number,
    options: Required<BatchGenerationOptions>,
    parseResults: ParseResult[],
    failedFiles: string[],
    recoveredFiles: string[]
  ): Promise<{ success: boolean; completedBatches: number; totalBatches: number; error?: string }> {
    let remainingFiles = [...initialRemaining];
    let currentBatch = startBatchNum;
    let retryCount = 0;

    while (remainingFiles.length > 0) {
      const batchFiles = remainingFiles.slice(0, options.maxFilesPerBatch);
      currentBatch++;

      const estimatedTotalBatches = currentBatch + Math.ceil((remainingFiles.length - batchFiles.length) / options.maxFilesPerBatch);

      options.onProgress(
        Object.keys(completedFiles).length,
        Object.keys(completedFiles).length + remainingFiles.length,
        currentBatch,
        estimatedTotalBatches
      );

      console.log(`[BatchGenerator] Generating batch ${currentBatch} with ${batchFiles.length} files`);

      const batchResult = await this.generateBatch(
        originalPrompt,
        systemInstruction,
        batchFiles,
        Object.keys(completedFiles),
        Object.keys(completedFiles).length,
        options
      );

      if (batchResult.parseResult) {
        parseResults.push(batchResult.parseResult);

        if (batchResult.parseResult.recoveredFiles) {
          recoveredFiles.push(...batchResult.parseResult.recoveredFiles);
        }
      }

      if (!batchResult.success) {
        retryCount++;

        if (retryCount <= options.maxRetries) {
          console.warn(`[BatchGenerator] Batch ${currentBatch} failed, retrying (${retryCount}/${options.maxRetries})`);
          currentBatch--; // Will retry same batch
          continue;
        }

        // Add failed files
        failedFiles.push(...batchFiles.filter(f => !completedFiles[f]));

        // Remove failed files from remaining
        remainingFiles = remainingFiles.filter(f => !batchFiles.includes(f));

        options.onError(new Error(batchResult.error || 'Batch generation failed'), currentBatch);

        // If all files failed, return error
        if (remainingFiles.length === 0 && Object.keys(completedFiles).length === 0) {
          return {
            success: false,
            completedBatches: currentBatch - 1,
            totalBatches: estimatedTotalBatches,
            error: batchResult.error,
          };
        }

        // Reset retry count for next batch
        retryCount = 0;
        continue;
      }

      // Success - reset retry count
      retryCount = 0;

      // Add new files
      if (batchResult.files) {
        Object.assign(completedFiles, batchResult.files);
      }

      // Update remaining files
      const newCompletedPaths = new Set(Object.keys(batchResult.files || {}));
      remainingFiles = remainingFiles.filter(f => !newCompletedPaths.has(f));

      // Check if AI indicated more remaining files
      if (batchResult.remainingFiles && batchResult.remainingFiles.length > 0) {
        // Merge with our remaining list
        for (const f of batchResult.remainingFiles) {
          if (!remainingFiles.includes(f) && !completedFiles[f]) {
            remainingFiles.push(f);
          }
        }
      }

      options.onBatchComplete(batchResult.files || {}, currentBatch, batchResult.parseResult!);

      console.log(`[BatchGenerator] Batch ${currentBatch} completed. Total files: ${Object.keys(completedFiles).length}, Remaining: ${remainingFiles.length}`);
    }

    return {
      success: true,
      completedBatches: currentBatch,
      totalBatches: currentBatch,
    };
  }

  /**
   * Generate a single batch
   */
  private async generateBatch(
    originalPrompt: string,
    systemInstruction: string,
    targetFiles: string[],
    completedFiles: string[],
    completedCount: number,
    options: Required<BatchGenerationOptions>
  ): Promise<BatchGenerateResult> {
    const provider = this.provider.getProvider();
    const activeConfig = this.provider.getActiveConfig();

    if (!provider || !activeConfig) {
      return {
        success: false,
        error: 'No AI provider configured',
      };
    }

    // Create batch-specific prompt
    const batchPrompt = this.createBatchPrompt(
      originalPrompt,
      targetFiles,
      completedFiles,
      completedCount,
      options
    );

    // Determine response format
    const config = getFluidFlowConfig();
    const responseFormat = options.useMarkerFormat ? 'marker' : (config.getResponseFormat() || 'json');

    const fullSystemInstruction = `${systemInstruction}

## BATCH GENERATION CONTEXT

This is batch ${Math.floor(completedCount / options.maxFilesPerBatch) + 1}.
- Generate ONLY the files listed in "TARGET FILES" section
- Each file must be COMPLETE and FUNCTIONAL
- Maximum ${options.maxTokensPerBatch} tokens for this batch
- If you cannot complete all files, use the batch/remaining mechanism to indicate what's left
- Focus on quality over quantity - complete files are better than partial ones`;

    console.log(`[BatchGenerator] Generating batch with ${targetFiles.length} files using ${responseFormat} format`);

    try {
      const response = await provider.generate({
        prompt: batchPrompt,
        systemInstruction: fullSystemInstruction,
        maxTokens: options.maxTokensPerBatch,
        temperature: 0.7,
        responseFormat: responseFormat === 'marker' ? undefined : 'json',
        responseSchema: responseFormat === 'json' && activeConfig.type && supportsAdditionalProperties(activeConfig.type)
          ? FILE_GENERATION_SCHEMA
          : undefined
      }, activeConfig.defaultModel);

      const responseText = response.text || '';

      // Parse using unified parser
      const parseResult = parseAIResponse(responseText);

      if (Object.keys(parseResult.files).length === 0) {
        // No files extracted
        return {
          success: false,
          response: responseText,
          parseResult,
          error: parseResult.errors.length > 0
            ? parseResult.errors.join('; ')
            : 'No files found in response',
          truncated: parseResult.truncated,
        };
      }

      // Filter to only include target files (or files AI decided to generate)
      const filteredFiles: FileSystem = {};
      for (const [path, content] of Object.entries(parseResult.files)) {
        // Accept files that are either in target list or are valid file paths
        if (targetFiles.includes(path) || (path.includes('/') && path.includes('.'))) {
          filteredFiles[path] = content;
        }
      }

      // Determine remaining files
      let remainingFiles: string[] = [];

      if (parseResult.batch && !parseResult.batch.isComplete) {
        remainingFiles = parseResult.batch.remaining;
      } else {
        // Check what wasn't generated
        remainingFiles = targetFiles.filter(f => !filteredFiles[f]);
      }

      return {
        success: true,
        files: filteredFiles,
        response: responseText,
        parseResult,
        truncated: parseResult.truncated,
        remainingFiles,
      };
    } catch (error) {
      console.error('[BatchGenerator] Error generating batch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create batch-specific prompt
   */
  private createBatchPrompt(
    originalPrompt: string,
    targetFiles: string[],
    completedFiles: string[],
    completedCount: number,
    _options: Required<BatchGenerationOptions>
  ): string {
    let prompt = originalPrompt;

    // Add batch context
    prompt += `\n\n---\n\n## GENERATION CONTEXT\n\n`;
    prompt += `You are generating files in batches. Progress: ${completedCount} files already completed.\n\n`;

    if (completedFiles.length > 0) {
      prompt += `### ALREADY COMPLETED FILES (${completedFiles.length}):\n`;
      prompt += completedFiles.map(f => `- ${f}`).join('\n');
      prompt += '\n\n';
    }

    prompt += `### TARGET FILES (${targetFiles.length}) - GENERATE ONLY THESE:\n`;
    prompt += targetFiles.map(f => `- ${f}`).join('\n');
    prompt += '\n\n';

    prompt += `### INSTRUCTIONS:\n`;
    prompt += `1. Generate ONLY the files listed in "TARGET FILES"\n`;
    prompt += `2. Each file must be COMPLETE and FUNCTIONAL\n`;
    prompt += `3. Do NOT repeat already completed files\n`;
    prompt += `4. Focus on one file at a time, ensuring each is fully implemented\n`;
    prompt += `5. If you cannot complete all files in this batch, set batch.isComplete to false and list remaining files\n`;

    return prompt;
  }

  /**
   * Generate continuation batch from parse result
   */
  async generateContinuation(
    originalPrompt: string,
    systemInstruction: string,
    previousResult: ParseResult,
    completedFiles: FileSystem,
    options: BatchGenerationOptions = {}
  ): Promise<BatchResult> {
    const continuationPrompt = getBatchContinuationPrompt(previousResult);

    if (!continuationPrompt) {
      return {
        success: true,
        files: completedFiles,
        completedBatches: previousResult.batch?.current || 1,
        totalBatches: previousResult.batch?.total || 1,
      };
    }

    const remainingFiles = previousResult.batch?.remaining || [];

    return this.generateInBatches(
      `${originalPrompt}\n\n${continuationPrompt}`,
      systemInstruction,
      remainingFiles,
      options
    );
  }
}

// Singleton instance
export const batchGenerator = new BatchGenerator();

// Export types and instance
export default batchGenerator;
