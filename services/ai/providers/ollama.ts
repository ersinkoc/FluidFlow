import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';

export class OllamaProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed. Is Ollama running?'
      };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    // Build prompt with images if present
    let prompt = request.prompt;

    const body: any = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    if (request.systemInstruction) {
      body.system = request.systemInstruction;
    }

    // Handle images for vision models
    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    // Use chat endpoint for better compatibility
    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      text: data.response || '',
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const body: any = {
      model,
      prompt: request.prompt,
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    if (request.systemInstruction) {
      body.system = request.systemInstruction;
    }

    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    const response = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = ''; // Buffer for incomplete lines

    if (reader) {
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
            if (!trimmedLine) continue;

            try {
              const parsed = JSON.parse(trimmedLine);
              if (parsed.response) {
                fullText += parsed.response;
                onChunk({ text: parsed.response, done: false });
              }
              if (parsed.done) {
                onChunk({ text: '', done: true });
              }
            } catch {
              // Skip invalid JSON - may be partial data
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            if (parsed.response) {
              fullText += parsed.response;
              onChunk({ text: parsed.response, done: false });
            }
            if (parsed.done) {
              onChunk({ text: '', done: true });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      } finally {
        // Release the reader lock to prevent memory leaks
        reader.releaseLock();
      }
    }

    return { text: fullText };
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await fetch(`${this.config.baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return (data.models || []).map((m: any) => ({
      id: m.name,
      name: m.name,
      description: `${(m.size / 1e9).toFixed(1)}GB`,
      supportsVision: m.name.includes('vision') || m.name.includes('llava'),
      supportsStreaming: true,
    }));
  }
}
