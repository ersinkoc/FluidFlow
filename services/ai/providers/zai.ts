import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';

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
    const messages: any[] = [];

    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }
    messages.push({ role: 'user', content: request.prompt });

    const body: any = {
      model: model || this.config.defaultModel || 'GLM-4.6',
      messages,
      max_tokens: request.maxTokens || 16384, // Reduced to 16K to prevent truncation
      temperature: request.temperature ?? 0.7,
    };

    if (request.responseFormat === 'json') {
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
    messages.push({ role: 'user', content: request.prompt });

    const body: any = {
      model: model || this.config.defaultModel || 'GLM-4.6',
      messages,
      max_tokens: request.maxTokens || 16384, // Reduced to 16K to prevent truncation
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.responseFormat === 'json') {
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
    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = ''; // Buffer for incomplete chunks

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines from buffer
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Log finish reason to debug truncation
              if (parsed.choices?.[0]?.finish_reason) {
                console.log('[ZAI] Stream finish reason:', parsed.choices[0].finish_reason);
              }

              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk({ text: content, done: false });
              }

              // Extract usage info if available
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || inputTokens;
                outputTokens = parsed.usage.completion_tokens || outputTokens;
                console.log('[ZAI] Token usage:', { inputTokens, outputTokens });
              }
            } catch (e) {
              // JSON parse failed - might be incomplete, will retry with more data
              // Only log if it looks like actual data (not empty or whitespace)
              if (data.trim().length > 10) {
                console.debug('[ZAI] Incomplete chunk, buffering:', data.slice(0, 50) + '...');
              }
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk({ text: content, done: false });
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || inputTokens;
                outputTokens = parsed.usage.completion_tokens || outputTokens;
              }
            } catch (e) {
              console.debug('[ZAI] Final buffer parse failed:', data.slice(0, 50));
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Check if response appears to be incomplete
    // Using explicit parentheses for clarity on operator precedence
    const trimmed = fullText.trim();
    const isIncomplete =
      (trimmed.endsWith('```') && !trimmed.includes('```tsx') && !trimmed.includes('```jsx')) ||
      (trimmed.endsWith('"') && !trimmed.endsWith('"}') && !trimmed.endsWith('"}\n')) ||
      (trimmed.includes('className=\\') && !trimmed.endsWith('}')) ||
      // Check for incomplete JSON
      (trimmed.includes('{') && !trimmed.endsWith('}')) ||
      // Check for unclosed JSON object (missing closing brace)
      (trimmed.startsWith('{') && trimmed.split('{').length > trimmed.split('}').length);

    if (isIncomplete) {
      console.warn('[ZAI] Response appears to be truncated');
    }

    onChunk({ text: '', done: true });

    return {
      text: fullText,
      usage: {
        inputTokens,
        outputTokens
      }
    };
  }
}