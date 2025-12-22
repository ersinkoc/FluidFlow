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
 * Trigger compaction with confirmation if needed
 * @param contextId - The context ID to compact
 * @param autoCompact - If true, skip confirmation. If false/undefined, check settings
 * @returns Promise<CompactionResult>
 */
export async function triggerCompaction(
  contextId: string,
  autoCompact?: boolean
): Promise<CompactionResult> {
  const contextManager = getContextManager();
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();

  const context = contextManager.getContext(contextId);
  const beforeTokens = context.estimatedTokens;
  const messageCount = context.messages.length;

  // Check if auto-compact is enabled
  const shouldAutoCompact = autoCompact ?? settings.autoCompact;

  // If not auto-compact, confirm with user
  if (!shouldAutoCompact) {
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
