/**
 * Utility functions for ContextIndicator
 */

import { getProviderManager } from '@/services/ai';
import { getFluidFlowConfig } from '@/services/fluidflowConfig';

/**
 * Get context window size for current model
 */
export function getModelContextSize(): number {
  const manager = getProviderManager();
  const config = manager.getActiveConfig();
  if (!config) return 128000; // Default

  const model = config.models.find(m => m.id === config.defaultModel);
  return model?.contextWindow || 128000;
}

/**
 * Get minimum remaining tokens threshold for compaction
 * Compaction is triggered when remaining context falls below this value
 */
export function getMinRemainingTokens(): number {
  const config = getFluidFlowConfig();
  const settings = config.getContextSettings();
  // Support both new and legacy field names
  return settings.minRemainingTokens ?? settings.maxTokensBeforeCompact ?? 8000;
}

/**
 * @deprecated Use getMinRemainingTokens instead
 */
export function getCompactionThreshold(): number {
  return getMinRemainingTokens();
}

/**
 * Get context display info
 * Returns model context size and minimum remaining tokens
 */
export function getContextDisplayInfo() {
  const modelContext = getModelContextSize();
  const minRemaining = getMinRemainingTokens();

  return {
    modelContext,
    minRemaining,
    // Compaction triggers when: modelContext - currentTokens < minRemaining
    // i.e., when currentTokens > modelContext - minRemaining
    compactionTriggerAt: modelContext - minRemaining,
  };
}

/**
 * Calculate remaining context space
 */
export function getRemainingContext(currentTokens: number): number {
  const modelContext = getModelContextSize();
  return Math.max(0, modelContext - currentTokens);
}

/**
 * Check if context needs compaction based on remaining space
 */
export function needsCompaction(currentTokens: number): boolean {
  const remaining = getRemainingContext(currentTokens);
  const minRemaining = getMinRemainingTokens();
  return remaining < minRemaining;
}
