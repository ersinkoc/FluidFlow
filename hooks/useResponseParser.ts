/**
 * useResponseParser Hook
 *
 * Handles parsing AI responses in both standard and search/replace modes.
 * Extracted from useCodeGeneration to reduce complexity.
 */

import { useCallback } from 'react';
import { FileSystem } from '../types';
import {
  cleanGeneratedCode,
  parseMultiFileResponse,
  GenerationMeta,
  parseSearchReplaceModeResponse,
  mergeSearchReplaceChanges,
} from '../utils/cleanCode';
import { debugLog } from './useDebugStore';

export interface StandardParseResult {
  explanation: string;
  newFiles: Record<string, string>;
  deletedFiles: string[];
  mergedFiles: FileSystem;
  wasTruncated: boolean;
  generationMeta?: GenerationMeta;
  continuation?: {
    prompt: string;
    remainingFiles: string[];
    currentBatch: number;
    totalBatches: number;
  };
}

export interface SearchReplaceParseResult {
  explanation: string;
  newFiles: Record<string, string>;
  mergedFiles: FileSystem;
}

export interface UseResponseParserOptions {
  files: FileSystem;
  existingApp: boolean;
  setStreamingStatus: (status: string) => void;
}

export interface UseResponseParserReturn {
  parseStandardResponse: (
    fullText: string,
    genRequestId: string,
    genStartTime: number,
    currentModel: string,
    providerName: string,
    chunkCount: number
  ) => StandardParseResult;

  parseSearchReplaceResponse: (
    fullText: string,
    genRequestId: string,
    genStartTime: number,
    currentModel: string,
    providerName: string,
    chunkCount: number
  ) => SearchReplaceParseResult | null;
}

export function useResponseParser(options: UseResponseParserOptions): UseResponseParserReturn {
  const { files, existingApp, setStreamingStatus } = options;

  /**
   * Parse response in standard full-file mode
   */
  const parseStandardResponse = useCallback(
    (
      fullText: string,
      genRequestId: string,
      genStartTime: number,
      currentModel: string,
      providerName: string,
      chunkCount: number
    ): StandardParseResult => {
      const parseResult = parseMultiFileResponse(fullText);
      if (!parseResult) {
        throw new Error('Could not parse response - no valid file content found');
      }

      const explanation = parseResult.explanation || 'App generated successfully.';
      const newFiles = parseResult.files;
      const deletedFiles = parseResult.deletedFiles || [];
      const wasTruncated = parseResult.truncated || false;
      const generationMeta = parseResult.generationMeta;
      const continuation = parseResult.continuation;

      // Warn if response was truncated but we recovered
      if (wasTruncated) {
        console.warn('[Generation] Response was truncated but partially recovered');
        setStreamingStatus('⚠️ Response truncated - showing recovered files');
      }

      // Log the efficiency (token savings)
      if (deletedFiles.length > 0 || (existingApp && Object.keys(newFiles).length < Object.keys(files).length)) {
        console.log(
          `🚀 Efficient update: Only ${Object.keys(newFiles).length} files modified, ${deletedFiles.length} deleted`
        );
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
          deletedFiles,
        }),
        metadata: {
          mode: 'generator',
          totalChunks: chunkCount,
          totalChars: fullText.length,
          provider: providerName,
          efficientUpdate: existingApp && Object.keys(newFiles).length < Object.keys(files).length,
        },
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
      let mergedFiles: FileSystem;
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

      return {
        explanation,
        newFiles,
        deletedFiles,
        mergedFiles,
        wasTruncated,
        generationMeta,
        continuation,
      };
    },
    [files, existingApp, setStreamingStatus]
  );

  /**
   * Parse response in search/replace mode (BETA)
   */
  const parseSearchReplaceResponse = useCallback(
    (
      fullText: string,
      genRequestId: string,
      genStartTime: number,
      currentModel: string,
      providerName: string,
      chunkCount: number
    ): SearchReplaceParseResult | null => {
      console.log('[SearchReplaceMode] Parsing search/replace response...');
      const srResult = parseSearchReplaceModeResponse(fullText);

      if (!srResult) {
        console.warn('[SearchReplaceMode] Failed to parse response, falling back to full mode');
        return null;
      }

      // Successfully parsed search/replace mode response
      const explanation = srResult.explanation || 'Changes applied successfully.';
      const deletedFiles = srResult.deletedFiles || [];

      // Use merge with detailed error reporting
      const mergeResult = mergeSearchReplaceChanges(files, srResult);

      if (!mergeResult.success) {
        console.warn('[SearchReplaceMode] Some replacements failed:', mergeResult.errors);
        setStreamingStatus(`⚠️ ${mergeResult.stats.replacementsFailed} replacement(s) failed`);
      }

      const mergedFiles = mergeResult.files;

      // Calculate which files actually changed
      const newFiles: Record<string, string> = {};
      for (const [path, content] of Object.entries(mergedFiles)) {
        if (files[path] !== content) {
          newFiles[path] = content;
        }
      }

      // Remove deleted files from merged
      for (const deletedPath of deletedFiles) {
        delete mergedFiles[deletedPath];
      }

      // Log search/replace mode efficiency
      console.log(
        `🔥 [SearchReplaceMode] Efficient update: ${mergeResult.stats.created} created, ${mergeResult.stats.updated} updated, ${mergeResult.stats.deleted} deleted, ${mergeResult.stats.replacementsApplied} replacements applied`
      );
      console.log(`[SearchReplaceMode] Changed files: ${Object.keys(newFiles).join(', ')}`);

      debugLog.response('generation', {
        id: genRequestId,
        model: currentModel,
        duration: Date.now() - genStartTime,
        response: JSON.stringify({
          explanation,
          mode: 'search-replace',
          stats: mergeResult.stats,
          errors: mergeResult.errors,
        }),
        metadata: {
          mode: 'search-replace-mode',
          totalChunks: chunkCount,
          totalChars: fullText.length,
          provider: providerName,
          srStats: mergeResult.stats,
        },
      });

      return { explanation, newFiles, mergedFiles };
    },
    [files, setStreamingStatus]
  );

  return {
    parseStandardResponse,
    parseSearchReplaceResponse,
  };
}
