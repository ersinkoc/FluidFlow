/**
 * Search/Replace Utilities
 *
 * Handles parsing and applying search/replace mode responses from AI.
 * Extracted from cleanCode.ts for better modularity.
 */

import type { FileSystem, SearchReplaceFileChange, SearchReplaceModeResponse } from '../types';
import { stripPlanComment, repairTruncatedJson, cleanGeneratedCode, isIgnoredFilePath } from './cleanCode';

/**
 * Result type for search/replace mode merge operation
 */
export interface SearchReplaceMergeResult {
  success: boolean;
  files: FileSystem;
  errors: string[];
  stats: {
    created: number;
    updated: number;
    deleted: number;
    failed: number;
    replacementsApplied: number;
    replacementsFailed: number;
  };
}

/**
 * Parses AI response in search/replace mode format.
 *
 * Expected format:
 * {
 *   "explanation": "What was changed...",
 *   "changes": {
 *     "src/App.tsx": {
 *       "replacements": [
 *         { "search": "old code", "replace": "new code" }
 *       ]
 *     },
 *     "src/NewFile.tsx": {
 *       "isNew": true,
 *       "content": "full file content..."
 *     }
 *   },
 *   "deletedFiles": ["src/OldFile.tsx"]
 * }
 */
export function parseSearchReplaceModeResponse(response: string): SearchReplaceModeResponse | null {
  try {
    // Strip PLAN comment if present
    let cleaned = stripPlanComment(response);

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[parseSearchReplaceModeResponse] No JSON found in response');
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to repair truncated JSON
      const repaired = repairTruncatedJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
    }

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[parseSearchReplaceModeResponse] Invalid response structure');
      return null;
    }

    // Extract changes - support both "changes" and "files" keys
    const changes = parsed.changes || parsed.files || {};

    // Convert to SearchReplaceModeResponse format
    const result: SearchReplaceModeResponse = {
      explanation: parsed.explanation || '',
      changes: {},
      deletedFiles: parsed.deletedFiles || []
    };

    // Process each file change
    for (const [filePath, change] of Object.entries(changes)) {
      // Skip non-file keys
      if (!filePath.includes('.') && !filePath.includes('/')) continue;

      // Handle various formats AI might return
      if (typeof change === 'string') {
        // Simple string content - treat as full file (isNew)
        result.changes[filePath] = {
          isNew: true,
          content: change
        };
      } else if (typeof change === 'object' && change !== null) {
        const changeObj = change as Record<string, unknown>;

        const fileChange: SearchReplaceFileChange = {};

        // Check if it's a new file
        if (changeObj.isNew) {
          fileChange.isNew = true;
          fileChange.content = (changeObj.content as string) || (changeObj.diff as string) || '';
        }

        // Check if it's deleted
        if (changeObj.isDeleted) {
          fileChange.isDeleted = true;
        }

        // Check for replacements array
        if (Array.isArray(changeObj.replacements)) {
          fileChange.replacements = changeObj.replacements.map((r: unknown) => {
            const rep = r as Record<string, string>;
            return {
              search: rep.search || '',
              replace: rep.replace || ''
            };
          }).filter(r => r.search); // Filter out empty searches
        }

        result.changes[filePath] = fileChange;
      }
    }

    console.log('[parseSearchReplaceModeResponse] Parsed search/replace response:', {
      filesChanged: Object.keys(result.changes).length,
      deletedFiles: result.deletedFiles?.length || 0
    });

    return result;
  } catch (e) {
    console.error('[parseSearchReplaceModeResponse] Parse error:', e);
    return null;
  }
}

/**
 * Applies search/replace operations to file content.
 * Returns the modified content.
 */
export function applySearchReplace(
  originalContent: string,
  replacements: { search: string; replace: string }[]
): { content: string; appliedCount: number; failedSearches: string[] } {
  let content = originalContent;
  let appliedCount = 0;
  const failedSearches: string[] = [];

  for (const { search, replace } of replacements) {
    if (!search) continue;

    // Unescape JSON-escaped characters
    const unescapedSearch = search
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');

    const unescapedReplace = replace
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');

    // Check if the search string exists in content
    if (content.includes(unescapedSearch)) {
      // Replace first occurrence only (to allow multiple targeted replacements)
      content = content.replace(unescapedSearch, unescapedReplace);
      appliedCount++;
      console.log(`[applySearchReplace] Applied replacement: "${unescapedSearch.substring(0, 50)}..." -> "${unescapedReplace.substring(0, 50)}..."`);
    } else {
      // Try with normalized whitespace
      const normalizedContent = content.replace(/\r\n/g, '\n');
      const normalizedSearch = unescapedSearch.replace(/\r\n/g, '\n');

      if (normalizedContent.includes(normalizedSearch)) {
        content = normalizedContent.replace(normalizedSearch, unescapedReplace);
        appliedCount++;
        console.log(`[applySearchReplace] Applied replacement (normalized): "${normalizedSearch.substring(0, 50)}..."`);
      } else {
        failedSearches.push(unescapedSearch.substring(0, 100));
        console.warn(`[applySearchReplace] Search string not found: "${unescapedSearch.substring(0, 100)}..."`);
      }
    }
  }

  return { content, appliedCount, failedSearches };
}

/**
 * Merges search/replace changes with the current file system.
 * Returns detailed result with stats and errors.
 */
export function mergeSearchReplaceChanges(
  currentFiles: FileSystem,
  response: SearchReplaceModeResponse
): SearchReplaceMergeResult {
  const result: SearchReplaceMergeResult = {
    success: true,
    files: { ...currentFiles },
    errors: [],
    stats: {
      created: 0,
      updated: 0,
      deleted: 0,
      failed: 0,
      replacementsApplied: 0,
      replacementsFailed: 0
    }
  };

  // Process deletions first
  for (const filePath of response.deletedFiles || []) {
    if (result.files[filePath]) {
      delete result.files[filePath];
      result.stats.deleted++;
      console.log(`[mergeSearchReplaceChanges] Deleted: ${filePath}`);
    }
  }

  // Process changes
  for (const [filePath, change] of Object.entries(response.changes)) {
    // Skip ignored paths
    if (isIgnoredFilePath(filePath)) {
      console.log(`[mergeSearchReplaceChanges] Skipping ignored path: ${filePath}`);
      continue;
    }

    // Handle deleted files
    if (change.isDeleted) {
      delete result.files[filePath];
      result.stats.deleted++;
      console.log(`[mergeSearchReplaceChanges] Deleted: ${filePath}`);
      continue;
    }

    // Handle new files
    if (change.isNew || !currentFiles[filePath]) {
      const content = change.content || '';
      // Unescape content
      const unescapedContent = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\');

      const cleanedContent = cleanGeneratedCode(unescapedContent);
      if (cleanedContent && cleanedContent.length >= 10) {
        result.files[filePath] = cleanedContent;
        result.stats.created++;
        console.log(`[mergeSearchReplaceChanges] Created new file: ${filePath} (${cleanedContent.length} chars)`);
      } else {
        result.errors.push(`New file ${filePath} has invalid content`);
        result.stats.failed++;
      }
      continue;
    }

    // Handle modifications with search/replace
    if (change.replacements && change.replacements.length > 0) {
      const originalContent = currentFiles[filePath];
      const { content: modifiedContent, appliedCount, failedSearches } = applySearchReplace(
        originalContent,
        change.replacements
      );

      result.stats.replacementsApplied += appliedCount;
      result.stats.replacementsFailed += failedSearches.length;

      if (appliedCount > 0) {
        const cleanedContent = cleanGeneratedCode(modifiedContent);
        if (cleanedContent && cleanedContent.length >= 10) {
          result.files[filePath] = cleanedContent;
          result.stats.updated++;
          console.log(`[mergeSearchReplaceChanges] Updated: ${filePath} (${appliedCount} replacements applied)`);
        } else {
          result.errors.push(`Modified content for ${filePath} is invalid`);
          result.stats.failed++;
        }
      }

      if (failedSearches.length > 0) {
        result.errors.push(`${filePath}: ${failedSearches.length} search(es) not found`);
      }
    }
  }

  result.success = result.stats.failed === 0 && result.stats.replacementsFailed === 0;

  console.log('[mergeSearchReplaceChanges] Result:', {
    success: result.success,
    stats: result.stats,
    errors: result.errors
  });

  return result;
}
