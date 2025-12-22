/**
 * AI Provider Capabilities Registry
 *
 * Centralized registry of model capabilities for all AI providers.
 * Provides quick lookups without API calls and helps with model selection.
 */

/**
 * Model capability flags
 */
export interface ModelCapabilities {
  /** Model supports image/vision input */
  supportsVision: boolean;
  /** Model supports streaming responses */
  supportsStreaming: boolean;
  /** Model supports JSON output mode */
  supportsJsonMode: boolean;
  /** Model supports function/tool calling */
  supportsFunctionCalling: boolean;
  /** Model supports structured output schemas */
  supportsStructuredOutput: boolean;
  /** Model context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Cost per million input tokens (USD) */
  inputCostPerMillion?: number;
  /** Cost per million output tokens (USD) */
  outputCostPerMillion?: number;
}

/**
 * Provider capability defaults
 */
export interface ProviderDefaults {
  /** Default capabilities for unknown models */
  defaultCapabilities: ModelCapabilities;
  /** Provider supports listing models dynamically */
  supportsModelList: boolean;
  /** Provider requires API key */
  requiresApiKey: boolean;
  /** Provider supports custom base URL */
  supportsCustomBaseUrl: boolean;
}

/**
 * Default capabilities when model info is unknown
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsVision: false,
  supportsStreaming: true,
  supportsJsonMode: true,
  supportsFunctionCalling: false,
  supportsStructuredOutput: false,
  contextWindow: 8192,
  maxOutputTokens: 4096,
};

/**
 * Known model capabilities by model ID prefix/pattern
 */
const MODEL_CAPABILITIES: Record<string, Partial<ModelCapabilities>> = {
  // Gemini models
  'gemini-3': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 1000000, maxOutputTokens: 65536 },
  'gemini-2.5-pro': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 1048576, maxOutputTokens: 65536 },
  'gemini-2.5-flash': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 1048576, maxOutputTokens: 65536 },
  'gemini-2.0': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 1048576, maxOutputTokens: 8192 },
  'gemini-1.5-pro': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 2097152, maxOutputTokens: 8192 },
  'gemini-1.5-flash': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 1048576, maxOutputTokens: 8192 },

  // OpenAI models
  'gpt-5': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsFunctionCalling: true, supportsStructuredOutput: true, contextWindow: 200000, maxOutputTokens: 16384 },
  'gpt-4o': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsFunctionCalling: true, supportsStructuredOutput: true, contextWindow: 128000, maxOutputTokens: 16384 },
  'gpt-4-turbo': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsFunctionCalling: true, contextWindow: 128000, maxOutputTokens: 4096 },
  'gpt-4': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, supportsFunctionCalling: true, contextWindow: 8192, maxOutputTokens: 4096 },
  'gpt-3.5-turbo': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, supportsFunctionCalling: true, contextWindow: 16385, maxOutputTokens: 4096 },
  'o1': { supportsVision: false, supportsStreaming: false, supportsJsonMode: false, contextWindow: 200000, maxOutputTokens: 100000 },
  'o3': { supportsVision: false, supportsStreaming: false, supportsJsonMode: false, contextWindow: 200000, maxOutputTokens: 100000 },
  'o4': { supportsVision: false, supportsStreaming: false, supportsJsonMode: false, contextWindow: 128000, maxOutputTokens: 65536 },

  // Anthropic models
  'claude-opus-4': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 200000, maxOutputTokens: 32000 },
  'claude-sonnet-4': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 200000, maxOutputTokens: 64000 },
  'claude-haiku-4': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, supportsStructuredOutput: true, contextWindow: 200000, maxOutputTokens: 64000 },
  'claude-3-opus': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-3-sonnet': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-3.5-sonnet': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 8192 },
  'claude-3-haiku': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 4096 },

  // Zai/GLM models
  'glm-4.7': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 131072 },
  'glm-4.6': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 131072 },
  'GLM-4': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 128000, maxOutputTokens: 8192 },

  // Local models (Ollama/LMStudio)
  'llama': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 8192, maxOutputTokens: 4096 },
  'llava': { supportsVision: true, supportsStreaming: true, supportsJsonMode: true, contextWindow: 4096, maxOutputTokens: 2048 },
  'codellama': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 16384, maxOutputTokens: 4096 },
  'mistral': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 32768, maxOutputTokens: 8192 },
  'mixtral': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 32768, maxOutputTokens: 8192 },
  'qwen': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 32768, maxOutputTokens: 8192 },
  'deepseek': { supportsVision: false, supportsStreaming: true, supportsJsonMode: true, contextWindow: 64000, maxOutputTokens: 8192 },
};

/**
 * Provider defaults
 */
const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
  gemini: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, supportsVision: true, supportsJsonMode: true, contextWindow: 1048576 },
    supportsModelList: false,
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  openai: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, supportsJsonMode: true, supportsFunctionCalling: true, contextWindow: 128000 },
    supportsModelList: true,
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
  },
  anthropic: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, supportsVision: true, supportsJsonMode: true, contextWindow: 200000 },
    supportsModelList: false,
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
  },
  openrouter: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, supportsJsonMode: true, contextWindow: 128000 },
    supportsModelList: true,
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
  },
  ollama: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, contextWindow: 8192 },
    supportsModelList: true,
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
  },
  lmstudio: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, contextWindow: 8192 },
    supportsModelList: true,
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
  },
  zai: {
    defaultCapabilities: { ...DEFAULT_CAPABILITIES, supportsVision: true, supportsJsonMode: true, contextWindow: 200000, maxOutputTokens: 131072 },
    supportsModelList: false,
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
  },
  custom: {
    defaultCapabilities: DEFAULT_CAPABILITIES,
    supportsModelList: false,
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
  },
};

/**
 * Get capabilities for a specific model
 * Matches by longest prefix match
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  // Find longest matching prefix
  let bestMatch: Partial<ModelCapabilities> | null = null;
  let bestMatchLength = 0;

  const lowerModelId = modelId.toLowerCase();

  for (const [prefix, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
    const lowerPrefix = prefix.toLowerCase();
    if (lowerModelId.startsWith(lowerPrefix) && lowerPrefix.length > bestMatchLength) {
      bestMatch = capabilities;
      bestMatchLength = lowerPrefix.length;
    }
  }

  if (bestMatch) {
    return { ...DEFAULT_CAPABILITIES, ...bestMatch };
  }

  return { ...DEFAULT_CAPABILITIES };
}

/**
 * Get provider defaults
 */
export function getProviderDefaults(providerType: string): ProviderDefaults {
  return PROVIDER_DEFAULTS[providerType] || PROVIDER_DEFAULTS.custom;
}

/**
 * Check if a model supports a specific capability
 */
export function modelSupports(modelId: string, capability: keyof ModelCapabilities): boolean {
  const caps = getModelCapabilities(modelId);
  const value = caps[capability];
  return typeof value === 'boolean' ? value : value > 0;
}

/**
 * Get models that support a specific capability
 */
export function getModelsWithCapability(
  capability: keyof ModelCapabilities,
  models: Array<{ id: string; name?: string }>
): Array<{ id: string; name?: string }> {
  return models.filter(model => modelSupports(model.id, capability));
}

/**
 * Find best model for a specific use case
 */
export type UseCase = 'vision' | 'code' | 'chat' | 'long-context' | 'fast' | 'cheap';

export function getBestModelForUseCase(
  useCase: UseCase,
  availableModels: Array<{ id: string; name?: string }>
): { id: string; name?: string } | null {
  const withCaps = availableModels.map(m => ({
    ...m,
    capabilities: getModelCapabilities(m.id),
  }));

  switch (useCase) {
    case 'vision':
      return withCaps.find(m => m.capabilities.supportsVision) || null;

    case 'code':
      // Prefer models with large context and structured output
      return withCaps
        .filter(m => m.capabilities.supportsStructuredOutput || m.capabilities.supportsJsonMode)
        .sort((a, b) => b.capabilities.contextWindow - a.capabilities.contextWindow)[0] || null;

    case 'long-context':
      return withCaps.sort((a, b) => b.capabilities.contextWindow - a.capabilities.contextWindow)[0] || null;

    case 'fast':
      // Prefer streaming models with smaller context (usually faster)
      return withCaps
        .filter(m => m.capabilities.supportsStreaming)
        .sort((a, b) => a.capabilities.contextWindow - b.capabilities.contextWindow)[0] || null;

    case 'cheap': {
      // Return models with known low cost
      const cheapModels = withCaps.filter(m =>
        m.id.toLowerCase().includes('mini') ||
        m.id.toLowerCase().includes('flash') ||
        m.id.toLowerCase().includes('haiku')
      );
      return cheapModels[0] || withCaps[0] || null;
    }

    case 'chat':
    default:
      // Prefer streaming models
      return withCaps.find(m => m.capabilities.supportsStreaming) || withCaps[0] || null;
  }
}

/**
 * Estimate token count from text
 * Rough estimate: ~4 characters per token for English
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content fits within model's context window
 */
export function fitsInContext(modelId: string, content: string, reserveForOutput: number = 4096): boolean {
  const caps = getModelCapabilities(modelId);
  const contentTokens = estimateTokenCount(content);
  return contentTokens + reserveForOutput <= caps.contextWindow;
}

/**
 * Get recommended max tokens for a model
 */
export function getRecommendedMaxTokens(modelId: string): number {
  const caps = getModelCapabilities(modelId);
  return caps.maxOutputTokens;
}
