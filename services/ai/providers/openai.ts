import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';

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
    const messages: any[] = [];

    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }

    // Build user message content
    const content: any[] = [];

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

    const body: any = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
    };

    // Only add response_format for native OpenAI models that support it
    // OpenRouter and other providers may not support this parameter
    if (request.responseFormat === 'json' && this.config.type === 'openai') {
      if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
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

    if (!response.ok) {
      // BUG-FIX: Read response text once to avoid "body already read" errors
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
      } catch {
        // Response wasn't valid JSON, use status code
        if (errorText) errorMessage += `: ${errorText.slice(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

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
    const messages: any[] = [];

    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }

    const content: any[] = [];

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

    const body: any = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
      stream: true,
      // Request usage stats in streaming (OpenAI API feature)
      stream_options: { include_usage: true },
    };

    // Only add response_format for native OpenAI models that support it
    if (request.responseFormat === 'json' && this.config.type === 'openai') {
      if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
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

    if (!response.ok) {
      // BUG-FIX: Read response text once to avoid "body already read" errors
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
      } catch {
        // Response wasn't valid JSON, use status code
        if (errorText) errorMessage += `: ${errorText.slice(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = ''; // Buffer for incomplete SSE lines
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;

    try {
      while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append new data to buffer
          buffer += decoder.decode(value, { stream: true });

          // Split by newlines but keep processing incomplete lines
          const lines = buffer.split('\n');

          // Keep the last line in buffer if it doesn't end with newline (incomplete)
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim(); // Remove 'data:' prefix
            if (data === '[DONE]') continue;
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) {
                fullText += text;
                onChunk({ text, done: false });
              }
              // Capture usage from final chunk (when stream_options.include_usage is true)
              if (parsed.usage) {
                usage = {
                  inputTokens: parsed.usage.prompt_tokens,
                  outputTokens: parsed.usage.completion_tokens,
                };
              }
            } catch (e) {
              // Log but don't fail on parse errors - might be partial data
              console.debug('[OpenAI Stream] Parse error, skipping chunk:', data.slice(0, 100));
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const text = parsed.choices?.[0]?.delta?.content || '';
                if (text) {
                  fullText += text;
                  onChunk({ text, done: false });
                }
                // Also check for usage in final buffer
                if (parsed.usage) {
                  usage = {
                    inputTokens: parsed.usage.prompt_tokens,
                    outputTokens: parsed.usage.completion_tokens,
                  };
                }
              } catch {
                // Ignore final buffer parse errors
              }
            }
          }
        }
    } finally {
      // Release the reader lock to prevent memory leaks
      reader.releaseLock();
    }

    onChunk({ text: '', done: true });

    // If no usage from API, estimate tokens (4 chars ≈ 1 token)
    let isEstimated = false;
    if (!usage) {
      const inputText = JSON.stringify(messages);
      usage = {
        inputTokens: Math.ceil(inputText.length / 4),
        outputTokens: Math.ceil(fullText.length / 4),
      };
      isEstimated = true;
    }

    return { text: fullText, usage: { ...usage, isEstimated } };
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
        .filter((m: any) => m.id && !m.id.includes(':free')) // Filter out free tier duplicates
        .slice(0, 100) // Limit to top 100 models
        .map((m: any) => ({
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
      .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1'))
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        supportsStreaming: !m.id.includes('o1'),
      }));
  }
}
