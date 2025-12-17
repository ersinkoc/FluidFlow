// AI Provider Types and Interfaces

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'zai' | 'ollama' | 'lmstudio' | 'openrouter' | 'custom';

/**
 * Retry utility with exponential backoff for transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryableErrors?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    retryableErrors = isRetryableError,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if error is not retryable or we've exhausted retries
      if (attempt >= maxRetries || !retryableErrors(lastError)) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable (network errors, rate limits, server errors)
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  models: ModelOption[];
  defaultModel: string;
  isLocal?: boolean;
  headers?: Record<string, string>;
}

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutput?: number;
  supportsVision?: boolean;
  supportsStreaming?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenerationRequest {
  prompt: string;
  systemInstruction?: string;
  images?: { data: string; mimeType: string }[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  // JSON Schema for structured output (used by Gemini's responseJsonSchema)
  // When provided with responseFormat: 'json', ensures response conforms to schema
  responseSchema?: Record<string, unknown>;
  // Debug category for logging (optional, defaults to 'generation')
  debugCategory?: 'generation' | 'accessibility' | 'quick-edit' | 'auto-fix' | 'other';
  // Conversation history for multi-turn conversations
  // Messages are sent before the current prompt
  conversationHistory?: ConversationMessage[];
}

export interface GenerationResponse {
  text: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    isEstimated?: boolean; // True if tokens are estimated (not from API)
  };
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface AIProvider {
  readonly config: ProviderConfig;

  // Test connection
  testConnection(): Promise<{ success: boolean; error?: string }>;

  // Generate content
  generate(request: GenerationRequest, model: string): Promise<GenerationResponse>;

  // Stream generation
  generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse>;

  // List available models (for providers that support it)
  listModels?(): Promise<ModelOption[]>;
}

// Default provider configurations - December 2025 (Based on LLMS.txt)
export const DEFAULT_PROVIDERS: Record<ProviderType, Omit<ProviderConfig, 'id' | 'apiKey'>> = {
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Flagship', supportsVision: true, supportsStreaming: true, contextWindow: 1000000 },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Flagship Fast & Efficient', supportsVision: true, supportsStreaming: true, contextWindow: 1000000 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Pro model', supportsVision: true, supportsStreaming: true, contextWindow: 1048576 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast & efficient', supportsVision: true, supportsStreaming: true, contextWindow: 1048576 },
    ],
    defaultModel: 'gemini-2.5-flash',
  },
  openai: {
    type: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Latest flagship $1.25/M', supportsVision: true, supportsStreaming: true, contextWindow: 200000 },
      { id: 'gpt-5', name: 'GPT-5', description: 'Flagship $1.25/M', supportsVision: true, supportsStreaming: true, contextWindow: 200000 },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast $0.25/M', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: 'Budget $0.05/M', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal $2.50/M', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cheap $0.15/M', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'o3', name: 'O3', description: 'Reasoning $2/M', supportsVision: false, supportsStreaming: false, contextWindow: 200000 },
      { id: 'o3-mini', name: 'O3 Mini', description: 'Reasoning $1.10/M', supportsVision: false, supportsStreaming: false, contextWindow: 128000 },
      { id: 'o4-mini', name: 'O4 Mini', description: 'New reasoning $1.10/M', supportsVision: false, supportsStreaming: false, contextWindow: 128000 },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', description: 'Code $1.25/M', supportsVision: false, supportsStreaming: true, contextWindow: 128000 },
    ],
    defaultModel: 'gpt-5-mini',
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', description: 'Most powerful', supportsVision: true, supportsStreaming: true, contextWindow: 200000 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Best balanced', supportsVision: true, supportsStreaming: true, contextWindow: 200000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast & cheap', supportsVision: true, supportsStreaming: true, contextWindow: 200000 },
    ],
    defaultModel: 'claude-sonnet-4-5-20250929',
  },
  zai: {
    type: 'zai',
    name: 'Z.AI (GLM)',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    models: [
      { id: 'GLM-4.6', name: 'GLM-4.6', description: 'Latest flagship', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'GLM-4.5', name: 'GLM-4.5', description: 'Powerful model', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
      { id: 'GLM-4.5-air', name: 'GLM-4.5 Air', description: 'Fast & efficient', supportsVision: true, supportsStreaming: true, contextWindow: 128000 },
    ],
    defaultModel: 'GLM-4.6',
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    isLocal: true,
    models: [], // Fetch from local server
    defaultModel: '',
  },
  lmstudio: {
    type: 'lmstudio',
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    isLocal: true,
    models: [],
    defaultModel: '',
  },
  openrouter: {
    type: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [], // Fetch from API
    defaultModel: '',
  },
  custom: {
    type: 'custom',
    name: 'Custom API',
    baseUrl: '',
    models: [],
    defaultModel: '',
  },
};
