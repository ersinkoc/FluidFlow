/**
 * Context Compaction Helper
 *
 * Provides utilities for checking and triggering context compaction
 * with user confirmation based on settings.
 */

import { getContextManager } from './conversationContext';
import { getFluidFlowConfig } from './fluidflowConfig';

export interface CompactionResult {
  compacted: boolean;
  beforeTokens: number;
  afterTokens: number;
  messagesSummarized: number;
  summary?: string;
}

export interface CompactionInfo {
  currentTokens: number;
  utilizationPercent: number;
  messageCount: number;
  targetTokens: number;
  message: string;
}

/**
 * Check if a context needs compaction based on current settings
 */
export function checkNeedsCompaction(contextId: string): boolean {
  const contextManager = getContextManager();
  const config = getFluidFlowConfig();
  const context = contextManager.getContext(contextId);

  const settings = config.getContextSettings();
  return context.estimatedTokens >= settings.maxTokensBeforeCompact;
}

/**
 * Get context statistics for display
 */
export function getContextStats(contextId: string) {
  const contextManager = getContextManager();
  const context = contextManager.getContext(contextId);
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  return {
    currentTokens: context.estimatedTokens,
    threshold: settings.maxTokensBeforeCompact,
    target: settings.compactToTokens,
    messageCount: context.messages.length,
    needsCompaction: context.estimatedTokens >= settings.maxTokensBeforeCompact,
    utilizationPercent: (context.estimatedTokens / settings.maxTokensBeforeCompact) * 100
  };
}

/**
 * Get compaction information for showing in a confirmation dialog
 */
export function getCompactionInfo(contextId: string): CompactionInfo {
  const stats = getContextStats(contextId);
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  return {
    currentTokens: stats.currentTokens,
    utilizationPercent: stats.utilizationPercent,
    messageCount: stats.messageCount,
    targetTokens: settings.compactToTokens,
    message: `Context is ${stats.currentTokens.toLocaleString()} tokens (${stats.utilizationPercent.toFixed(0)}% full).\n\n` +
      `Compacting will summarize older messages to free up space.\n\n` +
      `Messages: ${stats.messageCount}\n` +
      `Target: ~${settings.compactToTokens.toLocaleString()} tokens\n\n` +
      `Continue with compaction?`
  };
}

/**
 * Trigger compaction with optional confirmation callback
 * @param contextId - The context ID to compact
 * @param autoCompact - If true, skip confirmation. If false/undefined, check settings
 * @param onConfirm - Optional callback for showing confirmation dialog. Returns true if confirmed.
 * @returns Promise<CompactionResult>
 */
export async function triggerCompaction(
  contextId: string,
  autoCompact?: boolean,
  onConfirm?: (info: CompactionInfo) => Promise<boolean> | boolean
): Promise<CompactionResult> {
  const contextManager = getContextManager();
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  const context = contextManager.getContext(contextId);
  const beforeTokens = context.estimatedTokens;
  const messageCount = context.messages.length;

  // Check if auto-compact is enabled
  const shouldAutoCompact = autoCompact ?? settings.autoCompact;

  // If not auto-compact and onConfirm callback provided, use it
  if (!shouldAutoCompact) {
    if (onConfirm) {
      const info = getCompactionInfo(contextId);
      const confirmed = await onConfirm(info);

      if (!confirmed) {
        return {
          compacted: false,
          beforeTokens,
          afterTokens: beforeTokens,
          messagesSummarized: 0
        };
      }
    } else {
      // Legacy behavior: use window.confirm if no callback provided
      // This should ideally be removed in favor of always using the callback
      const stats = getContextStats(contextId);
      const confirmed = confirm(
        `Context is ${stats.currentTokens.toLocaleString()} tokens (${stats.utilizationPercent.toFixed(0)}% full).\n\n` +
          `Compacting will summarize older messages to free up space.\n\n` +
          `Messages: ${stats.messageCount}\n` +
          `Target: ~${settings.compactToTokens.toLocaleString()} tokens\n\n` +
          `Continue with compaction?`
      );

      if (!confirmed) {
        return {
          compacted: false,
          beforeTokens,
          afterTokens: beforeTokens,
          messagesSummarized: 0
        };
      }
    }
  }

  // Capture the summary separately since compactContext doesn't return it
  let capturedSummary: string | undefined;

  try {
    // Perform compaction
    await contextManager.compactContext(contextId, async (text) => {
      const { getProviderManager } = await import('./ai');
      const manager = getProviderManager();

      const request = {
        prompt: `Summarize this conversation concisely, preserving key decisions, code changes, and context:\n\n${text}`,
        systemInstruction: 'You are a conversation summarizer. Create a brief but complete summary that captures the essential context, decisions made, and any code or technical details discussed.',
        responseFormat: 'text' as const
      };

      const response = await manager.generate(request);
      capturedSummary = response.text || 'Conversation compacted';
      return capturedSummary;
    });

    const afterContext = contextManager.getContext(contextId);
    const afterTokens = afterContext.estimatedTokens;

    // Log compaction if enabled
    if (settings.saveCompactionLogs && capturedSummary) {
      config.addCompactionLog({
        contextId,
        beforeTokens,
        afterTokens,
        messagesSummarized: messageCount - 2, // Approximate
        summary: capturedSummary
      });
    }

    console.log(`[ContextCompaction] Compacted "${contextId}": ${beforeTokens} -> ${afterTokens} tokens`);

    return {
      compacted: true,
      beforeTokens,
      afterTokens,
      messagesSummarized: messageCount - afterContext.messages.length,
      summary: capturedSummary
    };
  } catch (error) {
    console.error('[ContextCompaction] Failed:', error);
    throw error;
  }
}

/**
 * Check and auto-compact if needed based on settings
 * This is the main function to call after adding messages
 */
export async function checkAndAutoCompact(contextId: string): Promise<CompactionResult | null> {
  if (!checkNeedsCompaction(contextId)) {
    return null;
  }

  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  if (settings.autoCompact) {
    return await triggerCompaction(contextId, true);
  }

  // Return result indicating compaction is needed but not performed
  const contextManager = getContextManager();
  const context = contextManager.getContext(contextId);

  return {
    compacted: false,
    beforeTokens: context.estimatedTokens,
    afterTokens: context.estimatedTokens,
    messagesSummarized: 0
  };
}

/**
 * Check if there's enough token space for a new prompt and compact if needed
 * Call this BEFORE sending a prompt to ensure we don't exceed context limits
 * @param contextId - The context ID to check
 * @param estimatedPromptTokens - Estimated tokens for the new prompt (optional, defaults to 1000)
 * @returns Promise<{canProceed: boolean, compacted: boolean, reason?: string}>
 */
export async function ensureTokenSpace(
  contextId: string,
  estimatedPromptTokens: number = 1000
): Promise<{ canProceed: boolean; compacted: boolean; reason?: string }> {
  const contextManager = getContextManager();
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  const context = contextManager.getContext(contextId);
  const currentTokens = context.estimatedTokens;
  const maxTokens = settings.maxTokensBeforeCompact;

  // Reserve space for prompt + response (estimate 2x prompt tokens for response)
  const totalEstimatedTokens = currentTokens + estimatedPromptTokens + (estimatedPromptTokens * 2);

  if (totalEstimatedTokens <= maxTokens) {
    // Enough space, no compaction needed
    return { canProceed: true, compacted: false };
  }

  // Not enough space - need to compact
  if (settings.autoCompact) {
    // Auto-compact and proceed
    try {
      const result = await triggerCompaction(contextId, true);
      if (result.compacted) {
        const newContext = contextManager.getContext(contextId);
        const newTotal = newContext.estimatedTokens + estimatedPromptTokens + (estimatedPromptTokens * 2);

        if (newTotal <= maxTokens) {
          console.log(`[ContextCompaction] Auto-compacted: ${currentTokens} -> ${newContext.estimatedTokens} tokens`);
          return { canProceed: true, compacted: true };
        } else {
          // Still not enough space even after compaction
          return {
            canProceed: false,
            compacted: true,
            reason: `Context still too large after compaction. Try clearing the conversation.`
          };
        }
      }
    } catch (error) {
      console.error('[ContextCompaction] Auto-compact failed:', error);
      return {
        canProceed: false,
        compacted: false,
        reason: `Failed to compact context: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Auto-compact is off - warn user
  return {
    canProceed: false,
    compacted: false,
    reason: `Context is ${currentTokens.toLocaleString()} tokens (${(currentTokens / maxTokens * 100).toFixed(0)}% full). Adding this prompt would exceed the limit. Please compact the context first.`
  };
}
