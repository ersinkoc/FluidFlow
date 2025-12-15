/**
 * AI Provider Error Handling Utilities
 *
 * Centralized error handling for AI provider API calls.
 * Provides consistent error messages across all providers.
 */

/**
 * AI Provider error codes for categorization
 */
export enum AIErrorCode {
  /** Network-related errors (timeout, connection refused) */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** HTTP error responses (4xx, 5xx) */
  HTTP_ERROR = 'HTTP_ERROR',
  /** Authentication/authorization errors (401, 403) */
  AUTH_ERROR = 'AUTH_ERROR',
  /** Rate limiting (429) */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Invalid request (400) */
  BAD_REQUEST = 'BAD_REQUEST',
  /** Model not found or unavailable (404) */
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  /** Service unavailable (503) */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Response parsing error */
  PARSE_ERROR = 'PARSE_ERROR',
  /** Stream processing error */
  STREAM_ERROR = 'STREAM_ERROR',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Structured AI Provider error with additional context
 */
export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly statusCode?: number;
  readonly provider?: string;
  readonly originalError?: unknown;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    code: AIErrorCode,
    options?: {
      statusCode?: number;
      provider?: string;
      originalError?: unknown;
    }
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.provider = options?.provider;
    this.originalError = options?.originalError;

    // Determine if error is retryable
    this.isRetryable = this.determineRetryable();
  }

  private determineRetryable(): boolean {
    switch (this.code) {
      case AIErrorCode.NETWORK_ERROR:
      case AIErrorCode.RATE_LIMIT:
      case AIErrorCode.SERVICE_UNAVAILABLE:
        return true;
      case AIErrorCode.AUTH_ERROR:
      case AIErrorCode.BAD_REQUEST:
      case AIErrorCode.MODEL_NOT_FOUND:
        return false;
      default:
        // Retry on 5xx errors
        return this.statusCode !== undefined && this.statusCode >= 500;
    }
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    switch (this.code) {
      case AIErrorCode.AUTH_ERROR:
        return 'Authentication failed. Please check your API key.';
      case AIErrorCode.RATE_LIMIT:
        return 'Rate limit exceeded. Please wait a moment and try again.';
      case AIErrorCode.MODEL_NOT_FOUND:
        return 'The selected model is not available. Please choose a different model.';
      case AIErrorCode.SERVICE_UNAVAILABLE:
        return 'The AI service is temporarily unavailable. Please try again later.';
      case AIErrorCode.NETWORK_ERROR:
        return 'Network error. Please check your internet connection.';
      case AIErrorCode.BAD_REQUEST:
        return `Invalid request: ${this.message}`;
      default:
        return this.message;
    }
  }
}

/**
 * Determine error code from HTTP status
 */
function getErrorCodeFromStatus(status: number): AIErrorCode {
  switch (status) {
    case 400:
      return AIErrorCode.BAD_REQUEST;
    case 401:
    case 403:
      return AIErrorCode.AUTH_ERROR;
    case 404:
      return AIErrorCode.MODEL_NOT_FOUND;
    case 429:
      return AIErrorCode.RATE_LIMIT;
    case 503:
      return AIErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? AIErrorCode.SERVICE_UNAVAILABLE : AIErrorCode.HTTP_ERROR;
  }
}

/**
 * Extract error message from API response
 * Handles different error formats from various providers
 */
function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // OpenAI/OpenRouter format: { error: { message: "..." } }
  if (obj.error && typeof obj.error === 'object') {
    const errorObj = obj.error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
  }

  // Anthropic format: { error: { message: "..." } } or { message: "..." }
  if (typeof obj.message === 'string') {
    return obj.message;
  }

  // Generic error field
  if (typeof obj.error === 'string') {
    return obj.error;
  }

  // Ollama format: { error: "..." }
  if (obj.detail && typeof obj.detail === 'string') {
    return obj.detail;
  }

  return null;
}

/**
 * Handle HTTP error response from AI provider
 * Reads response body once and creates structured error
 *
 * @param response - Fetch Response object
 * @param provider - Provider name for context
 * @returns AIProviderError with extracted message
 */
export async function handleAPIError(
  response: Response,
  provider?: string
): Promise<AIProviderError> {
  const status = response.status;
  const code = getErrorCodeFromStatus(status);

  let message = `HTTP ${status}`;

  try {
    // Read response text once to avoid "body already read" errors
    const errorText = await response.text();

    if (errorText) {
      try {
        const errorData = JSON.parse(errorText);
        const extractedMessage = extractErrorMessage(errorData);
        if (extractedMessage) {
          message = extractedMessage;
        }
      } catch {
        // Response wasn't valid JSON, use raw text (truncated)
        if (errorText.length > 0) {
          message += `: ${errorText.slice(0, 200)}`;
        }
      }
    }
  } catch {
    // Failed to read response body
  }

  return new AIProviderError(message, code, { statusCode: status, provider });
}

/**
 * Throw if response is not OK
 * Common pattern used in AI providers
 *
 * @param response - Fetch Response object
 * @param provider - Provider name for context
 * @throws AIProviderError if response is not OK
 */
export async function throwIfNotOk(response: Response, provider?: string): Promise<void> {
  if (!response.ok) {
    throw await handleAPIError(response, provider);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIProviderError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
    // Rate limiting
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
  }

  return false;
}

/**
 * Wrap error with AI provider context
 */
export function wrapError(error: unknown, provider?: string): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Detect error type from message
    let code = AIErrorCode.UNKNOWN;

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      code = AIErrorCode.NETWORK_ERROR;
    } else if (message.includes('network') || message.includes('ECONNREFUSED')) {
      code = AIErrorCode.NETWORK_ERROR;
    } else if (message.includes('rate limit') || message.includes('429')) {
      code = AIErrorCode.RATE_LIMIT;
    } else if (message.includes('unauthorized') || message.includes('401')) {
      code = AIErrorCode.AUTH_ERROR;
    }

    return new AIProviderError(message, code, { provider, originalError: error });
  }

  return new AIProviderError(String(error), AIErrorCode.UNKNOWN, {
    provider,
    originalError: error,
  });
}

/**
 * Format error for logging
 */
export function formatErrorForLog(error: unknown, context?: string): string {
  const prefix = context ? `[${context}]` : '';

  if (error instanceof AIProviderError) {
    return `${prefix} ${error.code}: ${error.message}${error.statusCode ? ` (HTTP ${error.statusCode})` : ''}`;
  }

  if (error instanceof Error) {
    return `${prefix} ${error.name}: ${error.message}`;
  }

  return `${prefix} Unknown error: ${String(error)}`;
}
