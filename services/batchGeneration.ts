import { getProviderManager } from './ai';
import { FileSystem } from '../types';
import { stripPlanComment } from '../utils/cleanCode';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from './ai/utils/schemas';

interface BatchGenerationOptions {
  maxFilesPerBatch?: number;
  maxTokensPerBatch?: number;
  onProgress?: (current: number, total: number, currentBatch: number, totalBatches: number) => void;
  onBatchComplete?: (batchFiles: FileSystem, batchNumber: number) => void;
  onError?: (error: Error, batchNumber: number) => void;
}

interface BatchResult {
  success: boolean;
  files: FileSystem;
  completedBatches: number;
  totalBatches: number;
  error?: string;
}

export class BatchGenerator {
  private provider = getProviderManager();
  private defaultOptions: Required<BatchGenerationOptions> = {
    maxFilesPerBatch: 5,
    maxTokensPerBatch: 8192,
    onProgress: () => {},
    onBatchComplete: () => {},
    onError: () => {}
  };

  async generateInBatches(
    prompt: string,
    systemInstruction: string,
    allFiles: string[], // Tüm üretilecek dosyaların listesi
    options: BatchGenerationOptions = {}
  ): Promise<BatchResult> {
    const opts = { ...this.defaultOptions, ...options };
    const completedFiles: FileSystem = {};
    let currentBatch = 0;
    const totalBatches = Math.ceil(allFiles.length / opts.maxFilesPerBatch);

    console.log(`[BatchGenerator] Starting batch generation: ${allFiles.length} files in ${totalBatches} batches`);

    // Başlangıçta ilk batch'i al
    const firstBatchResult = await this.generateBatch(
      prompt,
      systemInstruction,
      allFiles,
      [],
      0,
      opts
    );

    if (!firstBatchResult.success || firstBatchResult.truncated) {
      // Truncated olursa, batch sistemini başlat
      return await this.handleTruncatedResponse(
        prompt,
        systemInstruction,
        firstBatchResult.files || {},
        firstBatchResult.response || '',
        allFiles,
        opts
      );
    }

    // Başarılı ise, dosyaları birleştir
    Object.assign(completedFiles, firstBatchResult.files);
    currentBatch++;

    return {
      success: true,
      files: completedFiles,
      completedBatches: currentBatch,
      totalBatches: totalBatches
    };
  }

  private async handleTruncatedResponse(
    originalPrompt: string,
    systemInstruction: string,
    completedFiles: FileSystem,
    lastResponse: string,
    allFiles: string[],
    options: Required<BatchGenerationOptions>
  ): Promise<BatchResult> {
    const completedFilePaths = new Set(Object.keys(completedFiles));
    const remainingFiles = allFiles.filter(f => !completedFilePaths.has(f));

    console.log(`[BatchGenerator] Response truncated. Completed: ${completedFilePaths.size}, Remaining: ${remainingFiles.length}`);

    if (remainingFiles.length === 0) {
      // Tüm dosyalar zaten tamamlanmış
      return {
        success: true,
        files: completedFiles,
        completedBatches: Math.ceil(allFiles.length / options.maxFilesPerBatch),
        totalBatches: Math.ceil(allFiles.length / options.maxFilesPerBatch)
      };
    }

    // Continue with batch generation for remaining files
    let currentBatch = Math.ceil(completedFilePaths.size / options.maxFilesPerBatch);

    while (remainingFiles.length > 0) {
      const batchFiles = remainingFiles.slice(0, options.maxFilesPerBatch);
      currentBatch++;

      options.onProgress(
        completedFilePaths.size,
        allFiles.length,
        currentBatch,
        Math.ceil(allFiles.length / options.maxFilesPerBatch)
      );

      const batchResult = await this.generateBatch(
        originalPrompt,
        systemInstruction,
        batchFiles,
        completedFilePaths.size > 0 ? Array.from(completedFilePaths) : [],
        completedFilePaths.size,
        options
      );

      if (!batchResult.success) {
        options.onError(new Error(batchResult.error || 'Batch generation failed'), currentBatch);
        return {
          success: false,
          files: completedFiles,
          completedBatches: currentBatch - 1,
          totalBatches: Math.ceil(allFiles.length / options.maxFilesPerBatch),
          error: batchResult.error
        };
      }

      // Add new files to completed
      Object.assign(completedFiles, batchResult.files);

      // Remove completed files from remaining list
      const newCompletedPaths = new Set(Object.keys(batchResult.files));
      remainingFiles.splice(0, batchFiles.length, ...remainingFiles.slice(batchFiles.length).filter(f => !newCompletedPaths.has(f)));

      options.onBatchComplete(batchResult.files, currentBatch);

      console.log(`[BatchGenerator] Batch ${currentBatch} completed. Total files: ${Object.keys(completedFiles).length}`);
    }

    return {
      success: true,
      files: completedFiles,
      completedBatches: currentBatch,
      totalBatches: Math.ceil(allFiles.length / options.maxFilesPerBatch)
    };
  }

  private async generateBatch(
    originalPrompt: string,
    systemInstruction: string,
    targetFiles: string[],
    completedFiles: string[],
    completedCount: number,
    options: Required<BatchGenerationOptions>
  ): Promise<{ success: boolean; files?: FileSystem; response?: string; truncated?: boolean; error?: string }> {
    const provider = this.provider.getProvider();
    const activeConfig = this.provider.getActiveConfig();

    if (!provider || !activeConfig) {
      throw new Error('No AI provider configured');
    }

    // Create batch-specific prompt
    const batchPrompt = this.createBatchPrompt(
      originalPrompt,
      targetFiles,
      completedFiles,
      completedCount
    );

    const fullSystemInstruction = `${systemInstruction}

IMPORTANT: You are generating files in batches. This is batch ${Math.floor(completedCount / options.maxFilesPerBatch) + 1}.
- Only generate files listed in "TARGET FILES" section
- Each file should be complete and functional
- Maximum ${options.maxTokensPerBatch} tokens for this batch
- Focus on quality over quantity - better to have fewer complete files than many incomplete ones`;

    console.log(`[BatchGenerator] Generating batch with ${targetFiles.length} files`);

    const response = await provider.generate({
      prompt: batchPrompt,
      systemInstruction: fullSystemInstruction,
      maxTokens: options.maxTokensPerBatch,
      temperature: 0.7,
      responseFormat: 'json',
      // Only use native schema for providers that support dynamic keys
      responseSchema: activeConfig.type && supportsAdditionalProperties(activeConfig.type)
        ? FILE_GENERATION_SCHEMA
        : undefined
    }, activeConfig.defaultModel);

    // Parse response (with PLAN comment handling)
    try {
      const cleanedResponse = stripPlanComment(response.text || '');
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}?/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.files) {
          // Filter to only include target files
          const filteredFiles: FileSystem = {};
          targetFiles.forEach(filePath => {
            if (parsed.files[filePath]) {
              filteredFiles[filePath] = parsed.files[filePath];
            }
          });

          return {
            success: true,
            files: filteredFiles,
            truncated: false
          };
        }
      }

      // Check if response was truncated
      if (response.text && response.text.length > 1000) {
        return {
          success: false,
          response: response.text,
          truncated: true
        };
      }

      return {
        success: false,
        error: 'No valid files found in response'
      };
    } catch (error) {
      console.error('[BatchGenerator] Failed to parse response:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Parse error',
        truncated: response.text ? response.text.length > 1000 : false
      };
    }
  }

  private createBatchPrompt(
    originalPrompt: string,
    targetFiles: string[],
    completedFiles: string[],
    completedCount: number
  ): string {
    let prompt = originalPrompt;

    // Add batch context
    prompt += `\n\n## GENERATION CONTEXT\nYou are generating files in batches. Progress: ${completedCount} files already completed.\n\n`;

    if (completedFiles.length > 0) {
      prompt += `### ALREADY COMPLETED FILES (${completedFiles.length}):\n${completedFiles.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    prompt += `### TARGET FILES (${targetFiles.length}) - GENERATE ONLY THESE:\n${targetFiles.map(f => `- ${f}`).join('\n')}\n\n`;

    prompt += `### INSTRUCTIONS:\n`;
    prompt += `1. Generate ONLY the files listed in "TARGET FILES"\n`;
    prompt += `2. Each file must be COMPLETE and FUNCTIONAL\n`;
    prompt += `3. Do NOT repeat already completed files\n`;
    prompt += `4. Focus on one file at a time, ensuring each is fully implemented\n`;
    prompt += `5. If you cannot complete all files in this batch, complete as many as possible with quality\n\n`;

    prompt += `### RESPONSE FORMAT:\n`;
    prompt += `Respond with JSON:\n{\n`;
    prompt += `  "explanation": "Brief summary of what was generated",\n`;
    prompt += `  "files": {\n`;
    targetFiles.forEach((file, index) => {
      prompt += `    "${file}": "// complete ${file} content here"${index < targetFiles.length - 1 ? ',' : ''}\n`;
    });
    prompt += `  }\n`;
    prompt += `}`;

    return prompt;
  }
}

// Singleton instance
export const batchGenerator = new BatchGenerator();