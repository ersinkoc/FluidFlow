/**
 * Token Cost Estimator Types
 */

export interface ModelPricing {
  inputPricePer1M: number;  // Price per 1M input tokens
  outputPricePer1M: number; // Price per 1M output tokens
  currency: string;
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

// Model pricing data (updated 2025)
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputPricePer1M: 5, outputPricePer1M: 15, currency: 'USD' },
  'gpt-4o-mini': { inputPricePer1M: 0.15, outputPricePer1M: 0.60, currency: 'USD' },
  'gpt-4-turbo': { inputPricePer1M: 10, outputPricePer1M: 30, currency: 'USD' },
  'gpt-3.5-turbo': { inputPricePer1M: 0.5, outputPricePer1M: 1.5, currency: 'USD' },

  // Anthropic
  'claude-3-opus-20250219': { inputPricePer1M: 15, outputPricePer1M: 75, currency: 'USD' },
  'claude-3-sonnet-20250219': { inputPricePer1M: 3, outputPricePer1M: 15, currency: 'USD' },
  'claude-3-haiku-20250219': { inputPricePer1M: 0.25, outputPricePer1M: 1.25, currency: 'USD' },
  'claude-3.5-sonnet-20250219': { inputPricePer1M: 3, outputPricePer1M: 15, currency: 'USD' },

  // Google Gemini
  'gemini-2.0-flash-exp': { inputPricePer1M: 0.1, outputPricePer1M: 0.1, currency: 'USD' },
  'gemini-2.5-pro': { inputPricePer1M: 1.25, outputPricePer1M: 10, currency: 'USD' },
  'gemini-exp-1206': { inputPricePer1M: 0, outputPricePer1M: 0, currency: 'USD' }, // Free tier

  // ZAI (GLM models)
  'glm-4.7': { inputPricePer1M: 0.5, outputPricePer1M: 0.5, currency: 'USD' },
  'glm-4.6': { inputPricePer1M: 0.5, outputPricePer1M: 0.5, currency: 'USD' },

  // OpenRouter (average pricing)
  'openrouter': { inputPricePer1M: 1, outputPricePer1M: 2, currency: 'USD' },
};

/**
 * Calculate cost for a model
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): CostEstimate {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['openrouter'];

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePer1M;
  const totalCost = inputCost + outputCost;

  return {
    model,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost,
    currency: pricing.currency,
  };
}

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] || null;
}

/**
 * Format cost for display
 */
export function formatCost(cost: number, _currency: string = 'USD'): string {
  if (cost < 0.01) {
    return `< $0.01`;
  }
  return `$${cost.toFixed(4)}`;
}
