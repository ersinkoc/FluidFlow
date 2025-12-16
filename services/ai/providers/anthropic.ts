import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream } from '../utils/streamParser';

// Anthropic API content types for multimodal messages
type AnthropicContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

// Anthropic API message interface (only user/assistant, system is separate parameter)
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentPart[];
}

// Anthropic API request body
interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  system?: string;
  output_format?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
}

export class AnthropicProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      // Use centralized error handling
      await throwIfNotOk(response, 'anthropic');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: AnthropicMessage[] = [];

    // Use unified JSON output handling
    // Checks schema compatibility (dynamic keys require fallback to prompt guidance)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('anthropic', request.systemInstruction || '', request.responseSchema)
      : null;

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        // Anthropic doesn't support 'system' role in messages array (it uses 'system' param)
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Build user message content
    const content: AnthropicContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.data,
          }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: AnthropicRequestBody = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
    };

    // System instruction (may include schema guidance for fallback)
    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction;
    if (systemContent) {
      body.system = systemContent;
    }

    // Use native structured output only for compatible schemas (no dynamic keys)
    if (jsonRequest?.useNativeSchema && request.responseSchema) {
      body.output_format = {
        type: 'json_schema',
        schema: request.responseSchema
      };
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.headers,
    };

    // Add beta header for structured outputs
    if (jsonRequest?.useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'anthropic');

    const data = await response.json();
    const textContent = data.content?.find((c: { type: string; text?: string }) => c.type === 'text');

    return {
      text: textContent?.text || '',
      finishReason: data.stop_reason,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: AnthropicMessage[] = [];

    // Use unified JSON output handling
    // Checks schema compatibility (dynamic keys require fallback to prompt guidance)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('anthropic', request.systemInstruction || '', request.responseSchema)
      : null;

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        // Anthropic doesn't support 'system' role in messages array (it uses 'system' param)
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    const content: AnthropicContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.data,
          }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: AnthropicRequestBody = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // System instruction (may include schema guidance for fallback)
    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction;
    if (systemContent) {
      body.system = systemContent;
    }

    // Use native structured output only for compatible schemas (no dynamic keys)
    if (jsonRequest?.useNativeSchema && request.responseSchema) {
      body.output_format = {
        type: 'json_schema',
        schema: request.responseSchema
      };
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.headers,
    };

    // Add beta header for structured outputs
    if (jsonRequest?.useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'anthropic');

    // Use unified SSE stream parser
    const { fullText } = await processSSEStream(response, {
      format: 'anthropic',
      onChunk,
    });

    return { text: fullText };
  }
}
