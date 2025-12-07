/**
 * Input validation and sanitization utilities
 */

import path from 'path';

/**
 * Validates and sanitizes file paths to prevent directory traversal
 */
export function validateFilePath(filePath: string, basePath: string = ''): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for directory traversal attempts
  if (normalized.includes('..') || normalized.includes('~')) {
    throw new Error('Path traversal detected');
  }

  // Resolve relative to base path if provided
  if (basePath) {
    const resolved = path.resolve(basePath, normalized);
    if (!resolved.startsWith(path.resolve(basePath))) {
      throw new Error('Path is outside allowed directory');
    }
    return path.relative(basePath, resolved);
  }

  return normalized;
}

/**
 * Validates project ID format
 */
export function validateProjectId(projectId: string): boolean {
  if (!projectId || typeof projectId !== 'string') {
    return false;
  }

  // Allow only alphanumeric characters, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(projectId);
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Basic XSS prevention
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates file size
 */
export function validateFileSize(size: number, maxSize: number = 10 * 1024 * 1024): boolean {
  return size > 0 && size <= maxSize;
}

/**
 * Validates MIME type
 */
export function validateMimeType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}