import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk } from '../types';
import { GoogleGenAI } from '@google/genai';
import { supportsNativeSchema } from '../utils/schemas';

export class GeminiProvider implements AIProvider {
  readonly config: ProviderConfig;
  private client: GoogleGenAI;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey || '' });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Simple test - try to list models or make a tiny request
      await this.client.models.generateContent({
        model: this.config.defaultModel,
        contents: [{ parts: [{ text: 'Hi' }] }],
        config: { maxOutputTokens: 10 }
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const parts: any[] = [];

    // Add images if present
    if (request.images) {
      for (const img of request.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }

    // Add text prompt
    parts.push({ text: request.prompt });

    // Check if native schema enforcement can be used (only for static schemas)
    const useNativeSchema = request.responseFormat === 'json' &&
      request.responseSchema &&
      supportsNativeSchema('gemini', request.responseSchema as Record<string, unknown>);

    // Build system instruction with optional JSON schema guidance for dynamic schemas
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema && !useNativeSchema) {
      // Dynamic key schemas need system prompt guidance (native schema won't work)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction: systemContent || undefined,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    };

    // Enable JSON mode
    if (request.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
      // Use native schema enforcement for static schemas (ACCESSIBILITY_AUDIT_SCHEMA, etc.)
      if (useNativeSchema) {
        config.responseSchema = request.responseSchema;
      }
    }

    const response = await this.client.models.generateContent({
      model,
      contents: [{ parts }],
      config,
    });

    return {
      text: response.text || '',
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const parts: any[] = [];

    if (request.images) {
      for (const img of request.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }

    parts.push({ text: request.prompt });

    let fullText = '';

    // Check if native schema enforcement can be used (only for static schemas)
    const useNativeSchema = request.responseFormat === 'json' &&
      request.responseSchema &&
      supportsNativeSchema('gemini', request.responseSchema as Record<string, unknown>);

    // Build system instruction with optional JSON schema guidance for dynamic schemas
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema && !useNativeSchema) {
      // Dynamic key schemas need system prompt guidance (native schema won't work)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction: systemContent || undefined,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    };

    // Enable JSON mode
    if (request.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
      // Use native schema enforcement for static schemas (ACCESSIBILITY_AUDIT_SCHEMA, etc.)
      if (useNativeSchema) {
        config.responseSchema = request.responseSchema;
      }
    }

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents: [{ parts }],
        config,
      });

      for await (const chunk of stream) {
        const text = chunk.text || '';
        fullText += text;
        onChunk({ text, done: false });
      }
    } catch (error) {
      // Signal completion even on error, with partial text if available
      onChunk({ text: '', done: true });
      throw error;
    }

    onChunk({ text: '', done: true });

    // Gemini doesn't provide usage in streaming, so we'll estimate
    const estimatedInputTokens = Math.ceil(JSON.stringify(request).length / 4);
    const estimatedOutputTokens = Math.ceil(fullText.length / 4);

    return {
      text: fullText,
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        isEstimated: true, // Mark as estimated since streaming doesn't return real usage
      }
    };
  }
}
