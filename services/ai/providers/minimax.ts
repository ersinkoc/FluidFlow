import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { processSSEStream, createEstimatedUsage } from '../utils/streamParser';

// MiniMax API endpoint (used for reference, requests go through backend proxy)
const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

// Default model
const DEFAULT_MODEL = 'MiniMax-M2.1';

// Max output tokens
const DEFAULT_MAX_TOKENS = 16384;

// Backend proxy URL
const PROXY_URL = '/api/ai/minimax';

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
  stream_options?: { include_usage: boolean };
  response_format?: { type: 'json_object' };
  // MiniMax-specific: separate reasoning content
  reasoning_split?: boolean;
}

export class MiniMaxProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetchWithTimeout(`${PROXY_URL}/test`, {
        headers: {
          'X-API-Key': this.config.apiKey || '',
          'X-Base-URL': this.config.baseUrl || MINIMAX_BASE_URL,
        },
        timeout: TIMEOUT_TEST_CONNECTION,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MiniMax] Connection test failed:', message);
      return { success: false, error: message };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('minimax', request.systemInstruction || '', request.responseSchema)
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

    const selectedModel = model || this.config.defaultModel || DEFAULT_MODEL;

    const body: ChatCompletionRequest = {
      model: selectedModel,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
    };

    // MiniMax M2.1 supports reasoning_split to separate thinking from response
    if (selectedModel.includes('M2')) {
      body.reasoning_split = true;
    }

    // MiniMax supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetchWithTimeout(`${PROXY_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey || '',
          'X-Base-URL': this.config.baseUrl || MINIMAX_BASE_URL,
        },
        body: JSON.stringify(body),
        timeout: TIMEOUT_GENERATE,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      return {
        text: data.choices?.[0]?.message?.content || '',
        finishReason: data.choices?.[0]?.finish_reason || undefined,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MiniMax] Generate failed:', message);
      throw new Error(`MiniMax API error: ${message}`);
    }
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('minimax', request.systemInstruction || '', request.responseSchema)
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

    const selectedModel = model || this.config.defaultModel || DEFAULT_MODEL;

    const body: ChatCompletionRequest = {
      model: selectedModel,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };

    // MiniMax M2.1 supports reasoning_split
    if (selectedModel.includes('M2')) {
      body.reasoning_split = true;
    }

    // MiniMax supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetchWithTimeout(`${PROXY_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey || '',
          'X-Base-URL': this.config.baseUrl || MINIMAX_BASE_URL,
        },
        body: JSON.stringify(body),
        timeout: TIMEOUT_GENERATE,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Process SSE stream using OpenAI format (MiniMax is OpenAI-compatible)
      const { fullText, usage } = await processSSEStream(response, {
        format: 'openai',
        onChunk,
      });

      // If no usage from stream, estimate it
      const finalUsage = usage || createEstimatedUsage(
        messages.map(m => m.content).join(''),
        fullText
      );

      return {
        text: fullText,
        usage: finalUsage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MiniMax] Stream failed:', message);
      throw new Error(`MiniMax API error: ${message}`);
    }
  }
}
