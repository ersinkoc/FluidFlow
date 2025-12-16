import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream } from '../utils/streamParser';

// OpenAI-compatible API interfaces
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

export class ZAIProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.defaultModel || 'GLM-4.6',
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 10,
        }),
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      return response.ok ? { success: true } : { success: false, error: 'Failed to connect' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('zai', request.systemInstruction || '', request.responseSchema)
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

    messages.push({ role: 'user', content: request.prompt });

    const body: ChatCompletionRequest = {
      model: model || this.config.defaultModel || 'GLM-4.6',
      messages,
      max_tokens: request.maxTokens || 16384, // Reduced to 16K to prevent truncation
      temperature: request.temperature ?? 0.7,
    };

    // Z.AI supports json_object mode but not strict schema enforcement
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      body.response_format = { type: 'json_object' };
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'zai');

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
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('zai', request.systemInstruction || '', request.responseSchema)
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

    messages.push({ role: 'user', content: request.prompt });

    const body: ChatCompletionRequest = {
      model: model || this.config.defaultModel || 'GLM-4.6',
      messages,
      max_tokens: request.maxTokens || 16384, // Reduced to 16K to prevent truncation
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // Z.AI supports json_object mode but not strict schema enforcement
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      body.response_format = { type: 'json_object' };
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'zai');

    // Use unified SSE stream parser (OpenAI-compatible format)
    const { fullText, usage } = await processSSEStream(response, {
      format: 'openai',
      onChunk,
    });

    // Check if response appears to be incomplete (ZAI truncation detection)
    const trimmed = fullText.trim();
    const isIncomplete =
      (trimmed.endsWith('```') && !trimmed.includes('```tsx') && !trimmed.includes('```jsx')) ||
      (trimmed.endsWith('"') && !trimmed.endsWith('"}') && !trimmed.endsWith('"}\n')) ||
      (trimmed.includes('className=\\') && !trimmed.endsWith('}')) ||
      (trimmed.includes('{') && !trimmed.endsWith('}')) ||
      (trimmed.startsWith('{') && trimmed.split('{').length > trimmed.split('}').length);

    if (isIncomplete) {
      console.warn('[ZAI] Response appears to be truncated');
    }

    return { text: fullText, usage };
  }
}