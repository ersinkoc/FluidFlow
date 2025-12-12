import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';

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
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: any[] = [];

    // Build user message content
    const content: any[] = [];

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

    const body: any = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.systemInstruction) {
      body.system = request.systemInstruction;
    }

    // Use native structured output when schema is provided (beta feature)
    // Falls back to system prompt guidance for models without structured output support
    const useNativeSchema = request.responseFormat === 'json' && request.responseSchema;
    if (useNativeSchema) {
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
    if (useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
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
    const textContent = data.content?.find((c: any) => c.type === 'text');

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
    const messages: any[] = [];
    const content: any[] = [];

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

    const body: any = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.systemInstruction) {
      body.system = request.systemInstruction;
    }

    // Use native structured output when schema is provided (beta feature)
    const useNativeSchema = request.responseFormat === 'json' && request.responseSchema;
    if (useNativeSchema) {
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
    if (useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
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
    let buffer = ''; // Buffer for incomplete lines

    try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append new data to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines (ending with \n)
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;

            const data = trimmedLine.slice(5).trim(); // Remove 'data:' prefix
            if (!data || data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const text = parsed.delta.text;
                fullText += text;
                onChunk({ text, done: false });
              }
            } catch {
              // Skip invalid JSON - may be partial data
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  const text = parsed.delta.text;
                  fullText += text;
                  onChunk({ text, done: false });
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
    } finally {
      // Release the reader lock to prevent memory leaks
      reader.releaseLock();
    }

    onChunk({ text: '', done: true });
    return { text: fullText };
  }
}
