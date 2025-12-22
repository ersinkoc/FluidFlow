/**
 * Prompt Library Types
 * Shared interfaces for prompt categories and items
 */

/**
 * Prompt levels for different user needs:
 * - simple: Brief, essential instructions (1-2 sentences)
 * - detailed: Comprehensive with Tailwind classes and implementation details
 * - advanced: Expert-level with edge cases, accessibility, performance optimization
 */
export type PromptLevel = 'simple' | 'detailed' | 'advanced';

export interface PromptItem {
  id: string;
  label: string;
  /** Simple version - brief, essential instructions */
  simple: string;
  /** Detailed version - comprehensive with specific Tailwind classes */
  detailed: string;
  /** Advanced version - expert-level with edge cases and best practices */
  advanced: string;
  icon?: string;
}

export interface PromptCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompts: PromptItem[];
}

/**
 * Get prompt text by level
 * @param item The prompt item
 * @param level The desired detail level
 * @returns The prompt text for the specified level
 */
export function getPromptByLevel(item: PromptItem, level: PromptLevel): string {
  return item[level];
}

/**
 * Get default prompt (detailed level for backward compatibility)
 */
export function getDefaultPrompt(item: PromptItem): string {
  return item.detailed;
}
