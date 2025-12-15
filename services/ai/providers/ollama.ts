import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';
import { throwIfNotOk } from '../utils/errorHandling';

// Ollama API request interface
interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  system?: string;
  images?: string[];
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

// Ollama model info
interface OllamaModel {
  name: string;
  size: number;
}

export class OllamaProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/api/tags`, {
        timeout: TIMEOUT_TEST_CONNECTION,
      });
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
    // Build prompt with conversation history
    let prompt = '';

    // Include conversation history in prompt (Ollama uses single prompt, not messages array)
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyText = request.conversationHistory
        .map(msg => `${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}: ${msg.content}`)
        .join('\n\n');
      prompt = `${historyText}\n\nUser: ${request.prompt}`;
    } else {
      prompt = request.prompt;
    }

    const body: OllamaGenerateRequest = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    // Build system instruction with optional JSON schema guidance
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      // Include schema in system prompt for Ollama (no native schema enforcement)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      body.system = systemContent;
    }

    // Handle images for vision models
    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'ollama');

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
    // Build prompt with conversation history
    let prompt = '';

    // Include conversation history in prompt (Ollama uses single prompt, not messages array)
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyText = request.conversationHistory
        .map(msg => `${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}: ${msg.content}`)
        .join('\n\n');
      prompt = `${historyText}\n\nUser: ${request.prompt}`;
    } else {
      prompt = request.prompt;
    }

    const body: OllamaGenerateRequest = {
      model,
      prompt,
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    // Build system instruction with optional JSON schema guidance
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      // Include schema in system prompt for Ollama (no native schema enforcement)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      body.system = systemContent;
    }

    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'ollama');

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

    return { text: fullText };
  }

  async listModels(): Promise<ModelOption[]> {
    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/tags`, {
      timeout: TIMEOUT_LIST_MODELS,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return (data.models || []).map((m: OllamaModel) => ({
      id: m.name,
      name: m.name,
      description: `${(m.size / 1e9).toFixed(1)}GB`,
      supportsVision: m.name.includes('vision') || m.name.includes('llava'),
      supportsStreaming: true,
    }));
  }
}
