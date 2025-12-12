/**
 * Server-side validation utilities for security
 */

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a project ID is a valid UUID v4
 * Prevents path traversal and injection attacks
 */
export function isValidProjectId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

/**
 * Validates a file path to prevent path traversal attacks
 * Returns true if the path is safe to use
 */
export function isValidFilePath(filePath: unknown): boolean {
  if (typeof filePath !== 'string') return false;

  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');

  // Block path traversal attempts
  if (normalized.includes('..')) return false;

  // Block absolute paths
  if (normalized.startsWith('/')) return false;

  // Block Windows drive letters (C:, D:, etc.)
  if (/^[a-zA-Z]:/.test(normalized)) return false;

  // Block null bytes
  if (normalized.includes('\0')) return false;

  // Block URL-encoded traversal attempts
  if (/%2e%2e/i.test(normalized) || /%00/.test(normalized)) return false;

  // Block control characters (intentionally using control character regex for security)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(normalized)) return false;

  return true;
}

/**
 * Sanitizes a file path by normalizing separators
 * Should only be used AFTER validation
 */
export function sanitizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Validates that a value is a safe integer (for PIDs, ports, etc.)
 */
export function isValidInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= min && value <= max;
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return !isNaN(num) && String(num) === value && num >= min && num <= max;
  }
  return false;
}
