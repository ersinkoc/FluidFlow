import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';

export class OpenAIProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        }
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

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
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
    };

    // Only add response_format for native OpenAI models that support it
    if (request.responseFormat === 'json' && this.config.type === 'openai') {
      if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
        body.response_format = { type: 'json_object' };
      }
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = ''; // Buffer for incomplete SSE lines

    if (reader) {
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
    }

    onChunk({ text: '', done: true });
    return { text: fullText };
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await fetch(`${this.config.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      }
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
