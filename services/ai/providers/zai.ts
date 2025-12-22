import OpenAI from 'openai';
import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { prepareJsonRequest } from '../utils/jsonOutput';

// Z.AI Coding API endpoint (for GLM-4.7 coding plan)
const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

// Default model
const DEFAULT_MODEL = 'glm-4.7';

// Max output tokens (128K supported)
const DEFAULT_MAX_TOKENS = 131072; // 128K for GLM-4.7

export class ZAIProvider implements AIProvider {
  readonly config: ProviderConfig;
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    this.config = config;

    // Use coding endpoint for GLM-4.7
    const baseURL = config.baseUrl || ZAI_CODING_BASE_URL;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL,
      dangerouslyAllowBrowser: true, // Required for browser environment
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.defaultModel || DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10,
      });

      return completion.choices[0] ? { success: true } : { success: false, error: 'No response' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Connection test failed:', message);
      return { success: false, error: message };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: model || this.config.defaultModel || DEFAULT_MODEL,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
    };

    // Z.AI supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      requestParams.response_format = { type: 'json_object' };
    }

    try {
      const completion = await this.client.chat.completions.create(requestParams);

      return {
        text: completion.choices[0]?.message?.content || '',
        finishReason: completion.choices[0]?.finish_reason || undefined,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Generate failed:', message);
      throw new Error(`ZAI API error: ${message}`);
    }
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: model || this.config.defaultModel || DEFAULT_MODEL,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // Z.AI supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      requestParams.response_format = { type: 'json_object' };
    }

    try {
      const stream = await this.client.chat.completions.create(requestParams);

      let fullText = '';
      let finishReason: string | undefined;
      let usage: GenerationResponse['usage'];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        if (content) {
          fullText += content;
          onChunk({ text: content, done: false });
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Capture usage if available (some providers include it in the last chunk)
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      // Check if response appears to be incomplete (ZAI truncation detection)
      const trimmed = fullText.trim();
      const isIncomplete =
        (trimmed.endsWith('```') && !trimmed.includes('```tsx') && !trimmed.includes('```jsx')) ||
        (trimmed.endsWith('"') && !trimmed.endsWith('"}') && !trimmed.endsWith('"}\n')) ||
        (trimmed.includes('className=\\') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('{') && trimmed.split('{').length > trimmed.split('}').length);

      if (isIncomplete) {
        console.warn('[ZAI] Response appears to be truncated');
      }

      // Send final chunk with done: true
      onChunk({ text: '', done: true });

      return { text: fullText, finishReason, usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Stream failed:', message);
      throw new Error(`ZAI API error: ${message}`);
    }
  }
}
