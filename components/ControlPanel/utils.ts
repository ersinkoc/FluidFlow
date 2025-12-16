/**
 * ControlPanel Utility Functions
 *
 * Helper functions extracted from ControlPanel for better organization and testability.
 */

import { stripPlanComment } from '../../utils/cleanCode';
import { estimateTokenCount } from '../../services/ai/capabilities';

// Re-export for backwards compatibility
export { estimateTokenCount };

/**
 * Extract file list from AI response
 * Tries JSON parsing first, then falls back to regex patterns
 */
export function extractFileListFromResponse(response: string): string[] {
  const files = new Set<string>();

  // Try JSON parsing first (with PLAN comment handling)
  try {
    const cleaned = stripPlanComment(response);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}?/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.files) {
        Object.keys(parsed.files).forEach(file => files.add(file));
      }
    }
  } catch {
    // Continue with regex extraction
  }

  // Extract files using regex patterns
  const patterns = [
    /"([^"]+\.(tsx?|jsx?|css|json|md|sql|ts|js))":/g,
    /(?:^|\n)(src\/[^:\n]+\.(tsx?|jsx?|css|json|md|sql|ts|js))\s*:/gm,
    /(?:create|update|generate)\s+([^"]*\.(?:tsx?|jsx?|css|json|md|sql|ts|js))/gi
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const filePath = match[1] || match[2];
      if (filePath) {
        files.add(filePath);
      }
    }
  });

  return Array.from(files).sort();
}

/**
 * File plan structure detected from AI response
 */
export interface FilePlan {
  create: string[];
  update: string[];
  delete: string[];
  total: number;
}

/**
 * Parse PLAN comment from AI response
 * Format: // PLAN: {"create":[],"update":[],"delete":[],"total":N}
 */
export function parsePlanComment(response: string): FilePlan | null {
  const planMatch = response.match(/\/\/\s*PLAN:\s*(\{[\s\S]*?\})/);
  if (!planMatch) return null;

  try {
    const plan = JSON.parse(planMatch[1]);
    return {
      create: plan.create || [],
      update: plan.update || [],
      delete: plan.delete || [],
      total: plan.total || 0
    };
  } catch {
    return null;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Check if file is a code file
 */
export function isCodeFile(path: string): boolean {
  const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'less', 'html', 'json', 'md', 'sql'];
  return codeExtensions.includes(getFileExtension(path));
}

/**
 * Check if file is an image
 */
export function isImageFile(path: string): boolean {
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  return imageExtensions.includes(getFileExtension(path));
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
