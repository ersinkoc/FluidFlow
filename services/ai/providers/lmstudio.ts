import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream } from '../utils/streamParser';

// OpenAI-compatible API content types for multimodal messages
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// OpenAI-compatible API message interface
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

// LMStudio request body (OpenAI-compatible)
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  response_format?: { type: 'json_object' };
}

// LMStudio model object
interface LMStudioModel {
  id: string;
}

export class LMStudioProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed. Is LM Studio running?'
      };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    // Build system instruction with optional JSON schema guidance
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      // Include schema in system prompt for LMStudio (no native schema enforcement)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Build user message content
    const content: ContentPart[] = [];

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

    const body: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // LM Studio may optionally use API key
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'lmstudio');

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

    // Build system instruction with optional JSON schema guidance
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      // Include schema in system prompt for LMStudio (no native schema enforcement)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    const content: ContentPart[] = [];

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

    const body: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'lmstudio');

    // Use unified SSE stream parser (OpenAI-compatible format)
    const { fullText } = await processSSEStream(response, {
      format: 'openai',
      onChunk,
    });

    return { text: fullText };
  }

  async listModels(): Promise<ModelOption[]> {
    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
      timeout: TIMEOUT_LIST_MODELS,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return (data.data || []).map((m: LMStudioModel) => ({
      id: m.id,
      name: m.id,
      description: 'Local model',
      supportsVision: false,
      supportsStreaming: true,
    }));
  }
}
