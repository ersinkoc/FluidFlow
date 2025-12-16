import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream, createEstimatedUsage } from '../utils/streamParser';

// OpenAI-compatible API content types for multimodal messages
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// OpenAI-compatible API message interface
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

// OpenAI-compatible request body
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  response_format?:
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
}

// OpenAI model object
interface OpenAIModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string };
}

export class OpenAIProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    // Supports OpenAI, OpenRouter (native schema), and custom (fallback)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest(this.config.type, request.systemInstruction || '', request.responseSchema)
      : null;

    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction ?? '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Build user message content
    const content: ContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
    };

    // Add response_format for providers that support it (OpenAI, OpenRouter)
    if (request.responseFormat === 'json') {
      if (jsonRequest?.useNativeSchema && request.responseSchema) {
        // Use json_schema for strict structured output
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: request.responseSchema
          }
        };
      } else if (jsonRequest?.useJsonObject) {
        body.response_format = { type: 'json_object' };
      }
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'openai');

    const data = await response.json();

    return {
      text: data.choices[0]?.message?.content || '',
      finishReason: data.choices[0]?.finish_reason,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    // Supports OpenAI, OpenRouter (native schema), and custom (fallback)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest(this.config.type, request.systemInstruction || '', request.responseSchema)
      : null;

    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction ?? '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    const content: ContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
      stream: true,
      // Request usage stats in streaming (OpenAI API feature)
      stream_options: { include_usage: true },
    };

    // Add response_format for providers that support it (OpenAI, OpenRouter)
    if (request.responseFormat === 'json') {
      if (jsonRequest?.useNativeSchema && request.responseSchema) {
        // Use json_schema for strict structured output
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: request.responseSchema
          }
        };
      } else if (jsonRequest?.useJsonObject) {
        body.response_format = { type: 'json_object' };
      }
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'openai');

    // Use unified SSE stream parser
    const { fullText, usage } = await processSSEStream(response, {
      format: 'openai',
      onChunk,
    });

    // If no usage from API, estimate tokens
    if (!usage) {
      const estimated = createEstimatedUsage(JSON.stringify(messages), fullText);
      return { text: fullText, usage: estimated };
    }

    return { text: fullText, usage };
  }

  async listModels(): Promise<ModelOption[]> {
    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      timeout: TIMEOUT_LIST_MODELS,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // OpenRouter returns different structure
    if (this.config.type === 'openrouter') {
      return (data.data || [])
        .filter((m: OpenAIModel) => m.id && !m.id.includes(':free')) // Filter out free tier duplicates
        .slice(0, 100) // Limit to top 100 models
        .map((m: OpenAIModel) => ({
          id: m.id,
          name: m.name || m.id.split('/').pop() || m.id,
          description: m.description?.slice(0, 50) || `Context: ${m.context_length || 'unknown'}`,
          contextWindow: m.context_length,
          supportsVision: m.architecture?.modality?.includes('image') || false,
          supportsStreaming: true,
        }));
    }

    // OpenAI models
    return data.data
      .filter((m: OpenAIModel) => m.id.includes('gpt') || m.id.includes('o1'))
      .map((m: OpenAIModel) => ({
        id: m.id,
        name: m.id,
        supportsStreaming: !m.id.includes('o1'),
      }));
  }
}
