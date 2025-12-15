/**
 * Safe JSON utilities - Server-side exports
 *
 * Re-exports from shared module plus server-specific utilities.
 * All imports from 'server/utils/safeJson' continue to work.
 */

import fs from 'fs/promises';

// Re-export everything from shared
export {
  safeJsonParse,
  safeJsonStringify,
  safeJsonParseOrNull,
  type SafeJsonParseOptions,
  type SafeJsonStringifyOptions,
} from '../../shared/safeJson';

import { safeJsonParse } from '../../shared/safeJson';

// Server-specific constants
const MAX_JSON_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Safe file read + JSON parse helper (Server-only)
 *
 * Reads a file and parses its JSON content, returning fallback on any error.
 * Includes file size check to prevent DoS via large files.
 *
 * @param filePath - Path to the JSON file
 * @param fallback - Value to return if read or parse fails
 * @param maxSize - Maximum file size in bytes (default 10MB)
 * @returns Parsed JSON content or fallback
 */
export async function safeReadJson<T>(
  filePath: string,
  fallback: T,
  maxSize: number = MAX_JSON_FILE_SIZE
): Promise<T> {
  try {
    // Check file size before reading to prevent memory exhaustion
    const stats = await fs.stat(filePath);
    if (stats.size > maxSize) {
      console.error(
        `[SafeJson] File too large: ${filePath} (${stats.size} bytes, max ${maxSize})`
      );
      return fallback;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return safeJsonParse(content, fallback, { logErrors: true });
  } catch (error) {
    console.error(
      `[SafeJson] Failed to read JSON from ${filePath}:`,
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}
