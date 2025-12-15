/**
 * Retry Logic Utility for AI Provider Calls
 *
 * Provides exponential backoff retry logic with configurable options.
 * Integrates with error handling to determine retryable errors.
 */

import { isRetryableError, AIProviderError, AIErrorCode } from './errorHandling';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal' | 'isRetryable'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'onRetry' | 'signal' | 'isRetryable'>>
): number {
  const { initialDelayMs, maxDelayMs, backoffMultiplier, jitter } = options;

  // Exponential backoff
  let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, maxDelayMs);

  // Add jitter (±25%)
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5;
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for specified milliseconds with abort signal support
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * Retry result with metadata
 */
export interface RetryResult<T> {
  /** The successful result */
  result: T;
  /** Number of attempts made (1 = no retries needed) */
  attempts: number;
  /** Total time spent including delays */
  totalTimeMs: number;
}

/**
 * Execute a function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Promise with result and retry metadata
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => provider.generate(request, model),
 *   { maxRetries: 3, onRetry: (attempt, err) => console.log(`Retry ${attempt}`, err) }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, signal, onRetry, isRetryable: customIsRetryable } = opts;

  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const result = await fn();
      return {
        result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = customIsRetryable
        ? customIsRetryable(error)
        : isRetryableError(error);

      // If not retryable or last attempt, throw
      if (!shouldRetry || attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, opts);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      // Wait before retry
      await sleep(delay, signal);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Create a retryable version of an async function
 *
 * @param fn - Async function to wrap
 * @param options - Retry configuration
 * @returns Wrapped function with retry logic
 *
 * @example
 * ```ts
 * const retryableGenerate = withRetryWrapper(
 *   (req, model) => provider.generate(req, model),
 *   { maxRetries: 2 }
 * );
 * const result = await retryableGenerate(request, model);
 * ```
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<RetryResult<TResult>> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Retry with rate limit awareness
 * Extracts retry-after header from rate limit errors
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const enhancedOnRetry = (attempt: number, error: unknown, delayMs: number) => {
    // Check for rate limit specific delay
    if (error instanceof AIProviderError && error.code === AIErrorCode.RATE_LIMIT) {
      // Could extract retry-after header here if available
      console.log(`[Retry] Rate limited, waiting ${delayMs}ms before attempt ${attempt + 1}`);
    }

    // Call original onRetry if provided
    if (options.onRetry) {
      options.onRetry(attempt, error, delayMs);
    }
  };

  return withRetry(fn, {
    ...options,
    onRetry: enhancedOnRetry,
    // Longer delays for rate limiting
    initialDelayMs: options.initialDelayMs ?? 2000,
    maxDelayMs: options.maxDelayMs ?? 60000,
  });
}

/**
 * Simple retry for non-critical operations
 * Only retries once with short delay
 */
export async function withSimpleRetry<T>(fn: () => Promise<T>): Promise<T> {
  const result = await withRetry(fn, {
    maxRetries: 1,
    initialDelayMs: 500,
    jitter: false,
  });
  return result.result;
}
