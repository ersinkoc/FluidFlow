/**
 * restoreHistory - Utility for restoring chat state from AI history entries
 *
 * Handles:
 * - Parsing history entries to rebuild chat messages
 * - Calculating file changes between entries
 * - Merging files with deleted file support
 */

import { ChatMessage, FileSystem } from '@/types';
import { cleanGeneratedCode, parseMultiFileResponse } from '@/utils/cleanCode';
import { calculateFileChanges } from '@/utils/generationUtils';
import { AIHistoryEntry } from '@/services/projectApi';

export interface RestoreResult {
  messages: ChatMessage[];
  files: FileSystem;
  success: boolean;
  error?: string;
}

/**
 * Restore messages and files from a list of AI history entries
 * @param entries - History entries to restore (should be sorted oldest first)
 * @returns RestoreResult with messages and files
 */
export function restoreFromHistoryEntries(entries: AIHistoryEntry[]): RestoreResult {
  try {
    const restoredMessages: ChatMessage[] = [];
    let previousFiles: FileSystem = {};

    for (const historyEntry of entries) {
      // Parse files from this entry
      const parsed = parseMultiFileResponse(historyEntry.rawResponse);
      if (!parsed?.files) continue;

      // Clean the generated code
      const cleanedFiles: FileSystem = {};
      for (const [path, content] of Object.entries(parsed.files)) {
        cleanedFiles[path] = cleanGeneratedCode(content);
      }

      // Calculate file changes with support for deleted files
      let mergedFiles: FileSystem;
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
      return {
        messages: [],
        files: {},
        success: false,
        error: 'No files found in history entries'
      };
    }

    return {
      messages: restoredMessages,
      files: previousFiles,
      success: true
    };
  } catch (error) {
    console.error('[restoreHistory] Failed to restore:', error);
    return {
      messages: [],
      files: {},
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get entries up to and including a specific timestamp
 * @param history - Full history array
 * @param targetTimestamp - Timestamp to restore up to
 * @returns Sorted entries (oldest first)
 */
export function getEntriesUpToTimestamp(
  history: AIHistoryEntry[],
  targetTimestamp: number
): AIHistoryEntry[] {
  return history
    .filter(h => h.timestamp <= targetTimestamp && h.success)
    .sort((a, b) => a.timestamp - b.timestamp);
}
