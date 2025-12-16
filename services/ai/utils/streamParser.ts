/**
 * Unified SSE (Server-Sent Events) Stream Parser
 *
 * Provides a unified interface for parsing SSE streams from different AI providers.
 * Each provider has different data formats but similar SSE structure.
 */

import { StreamChunk } from '../types';
import { estimateTokenCount } from '../capabilities';

/**
 * Supported AI provider formats for SSE parsing
 */
export type SSEProviderFormat = 'openai' | 'anthropic' | 'ollama' | 'gemini';

/**
 * Result of parsing an SSE event
 */
export interface SSEParseResult {
  /** Extracted text content */
  text: string;
  /** Whether this is the final event */
  done: boolean;
  /** Usage information if available */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  /** Raw parsed JSON data */
  rawData?: unknown;
}

/**
 * Options for the SSE parser
 */
export interface SSEParserOptions {
  /** AI provider format to use */
  format: SSEProviderFormat;
  /** Callback for each parsed chunk */
  onChunk: (chunk: StreamChunk) => void;
  /** Optional callback for errors */
  onError?: (error: Error) => void;
  /** Optional callback for raw SSE events (debugging) */
  onRawEvent?: (event: string) => void;
}

/**
 * Extracts text content from parsed SSE data based on provider format
 */
export function extractTextFromSSE(data: unknown, format: SSEProviderFormat): SSEParseResult {
  if (!data || typeof data !== 'object') {
    return { text: '', done: false };
  }

  const parsed = data as Record<string, unknown>;

  switch (format) {
    case 'openai': {
      // OpenAI format: { choices: [{ delta: { content: "text" } }], usage?: {...} }
      const choices = parsed.choices as Array<{ delta?: { content?: string }; finish_reason?: string }> | undefined;
      const text = choices?.[0]?.delta?.content || '';
      const done = choices?.[0]?.finish_reason !== null && choices?.[0]?.finish_reason !== undefined;
      const usage = parsed.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

      return {
        text,
        done,
        usage: usage ? {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        } : undefined,
        rawData: data,
      };
    }

    case 'anthropic': {
      // Anthropic format: { type: "content_block_delta", delta: { text: "text" } }
      // or { type: "message_stop" } for done
      const eventType = parsed.type as string;

      if (eventType === 'content_block_delta') {
        const delta = parsed.delta as { text?: string } | undefined;
        return {
          text: delta?.text || '',
          done: false,
          rawData: data,
        };
      }

      if (eventType === 'message_stop' || eventType === 'message_delta') {
        return {
          text: '',
          done: eventType === 'message_stop',
          rawData: data,
        };
      }

      return { text: '', done: false, rawData: data };
    }

    case 'ollama': {
      // Ollama /api/generate format: { response: "text", done: boolean }
      // Also supports /api/chat format: { message: { content: "text" }, done: boolean }
      const response = parsed.response as string | undefined;
      const message = parsed.message as { content?: string } | undefined;
      return {
        text: response || message?.content || '',
        done: parsed.done === true,
        rawData: data,
      };
    }

    case 'gemini': {
      // Gemini streaming is handled differently (async iterator)
      // This is for consistency but Gemini uses its own SDK streaming
      const text = parsed.text as string | undefined;
      return {
        text: text || '',
        done: false,
        rawData: data,
      };
    }

    default:
      return { text: '', done: false, rawData: data };
  }
}

/**
 * Parses a single SSE line and extracts data
 */
export function parseSSELine(line: string): { type: 'data' | 'event' | 'done' | 'ignore'; data?: string } {
  const trimmed = line.trim();

  // Empty line or comment
  if (!trimmed || trimmed.startsWith(':')) {
    return { type: 'ignore' };
  }

  // Check for done marker
  if (trimmed === 'data: [DONE]') {
    return { type: 'done' };
  }

  // Data line
  if (trimmed.startsWith('data:')) {
    const data = trimmed.slice(5).trim();
    return { type: 'data', data };
  }

  // Event type line (not typically used for content)
  if (trimmed.startsWith('event:')) {
    return { type: 'event', data: trimmed.slice(6).trim() };
  }

  // Unknown format, treat as data if it looks like JSON
  if (trimmed.startsWith('{')) {
    return { type: 'data', data: trimmed };
  }

  return { type: 'ignore' };
}

/**
 * Creates an SSE stream processor that handles buffering and parsing
 */
export function createSSEProcessor(options: SSEParserOptions) {
  const { format, onChunk, onError, onRawEvent } = options;
  let buffer = '';
  let fullText = '';
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;

  return {
    /**
     * Process a chunk of data from the stream
     */
    processChunk(chunk: string): void {
      buffer += chunk;

      // Split by newlines but keep incomplete lines in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (onRawEvent) {
          onRawEvent(line);
        }

        const parsed = parseSSELine(line);

        if (parsed.type === 'done') {
          continue;
        }

        if (parsed.type === 'data' && parsed.data) {
          try {
            const jsonData = JSON.parse(parsed.data);
            const result = extractTextFromSSE(jsonData, format);

            if (result.text) {
              fullText += result.text;
              onChunk({ text: result.text, done: false });
            }

            if (result.usage) {
              usage = result.usage;
            }
          } catch (e) {
            // Log but don't fail on parse errors - might be partial data
            console.debug(`[SSEParser:${format}] Parse error, skipping chunk:`, parsed.data?.slice(0, 100));
            if (onError) {
              onError(e instanceof Error ? e : new Error(String(e)));
            }
          }
        }
      }
    },

    /**
     * Flush any remaining data in the buffer
     */
    flush(): void {
      if (buffer.trim()) {
        const parsed = parseSSELine(buffer);
        if (parsed.type === 'data' && parsed.data) {
          try {
            const jsonData = JSON.parse(parsed.data);
            const result = extractTextFromSSE(jsonData, format);

            if (result.text) {
              fullText += result.text;
              onChunk({ text: result.text, done: false });
            }

            if (result.usage) {
              usage = result.usage;
            }
          } catch {
            // Ignore final buffer parse errors
          }
        }
      }
      buffer = '';
    },

    /**
     * Complete the stream and return results
     */
    complete(): { fullText: string; usage?: { inputTokens?: number; outputTokens?: number } } {
      this.flush();
      onChunk({ text: '', done: true });
      return { fullText, usage };
    },

    /**
     * Get current accumulated text
     */
    getText(): string {
      return fullText;
    },

    /**
     * Get current usage stats
     */
    getUsage(): { inputTokens?: number; outputTokens?: number } | undefined {
      return usage;
    },
  };
}

/**
 * Process an entire SSE stream from a Response object
 * This is the main entry point for most use cases
 */
export async function processSSEStream(
  response: Response,
  options: SSEParserOptions
): Promise<{ fullText: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  const processor = createSSEProcessor(options);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      processor.processChunk(chunk);
    }

    return processor.complete();
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create estimated usage from request and response text
 */
export function createEstimatedUsage(
  requestText: string,
  responseText: string
): { inputTokens: number; outputTokens: number; isEstimated: true } {
  return {
    inputTokens: estimateTokenCount(requestText),
    outputTokens: estimateTokenCount(responseText),
    isEstimated: true,
  };
}

// Re-export for backwards compatibility
export { estimateTokenCount as estimateTokens } from '../capabilities';
