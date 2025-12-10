import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { GoogleGenAI } from '@google/genai';

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

    const response = await this.client.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        systemInstruction: request.systemInstruction,
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        responseMimeType: request.responseFormat === 'json' ? 'application/json' : undefined,
      }
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

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents: [{ parts }],
        config: {
          systemInstruction: request.systemInstruction,
          maxOutputTokens: request.maxTokens,
          temperature: request.temperature,
          responseMimeType: request.responseFormat === 'json' ? 'application/json' : undefined,
        }
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
        outputTokens: estimatedOutputTokens
      }
    };
  }
}
