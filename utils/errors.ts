/**
 * FluidFlow Error Handling
 *
 * Centralized error types and handling utilities.
 * Provides structured errors with codes for better debugging and user feedback.
 */

/**
 * Error codes for categorizing errors
 */
export enum ErrorCode {
  // File Operations
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  INVALID_FILE_PATH = 'INVALID_FILE_PATH',

  // Project Operations
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_LOCKED = 'PROJECT_LOCKED',
  PROJECT_CREATE_FAILED = 'PROJECT_CREATE_FAILED',
  PROJECT_DELETE_FAILED = 'PROJECT_DELETE_FAILED',

  // Git Operations
  GIT_NOT_INITIALIZED = 'GIT_NOT_INITIALIZED',
  GIT_COMMIT_FAILED = 'GIT_COMMIT_FAILED',
  GIT_CHECKOUT_FAILED = 'GIT_CHECKOUT_FAILED',
  GIT_PUSH_FAILED = 'GIT_PUSH_FAILED',

  // AI Operations
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',
  AI_CONTEXT_TOO_LONG = 'AI_CONTEXT_TOO_LONG',
  AI_INVALID_RESPONSE = 'AI_INVALID_RESPONSE',
  AI_CONNECTION_FAILED = 'AI_CONNECTION_FAILED',

  // Storage Operations
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  WIP_SAVE_FAILED = 'WIP_SAVE_FAILED',
  WIP_RESTORE_FAILED = 'WIP_RESTORE_FAILED',
  INDEXEDDB_ERROR = 'INDEXEDDB_ERROR',

  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVER_ERROR = 'SERVER_ERROR',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

/**
 * Severity levels for errors
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Context information for errors
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * FluidFlow custom error class
 *
 * Provides structured errors with codes and context for better debugging.
 *
 * @example
 * throw new FluidFlowError(
 *   'File is too large to process',
 *   ErrorCode.FILE_TOO_LARGE,
 *   { filePath: '/path/to/file', size: 10000000 }
 * );
 */
export class FluidFlowError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context: ErrorContext = {},
    severity: ErrorSeverity = 'error'
  ) {
    super(message);
    this.name = 'FluidFlowError';
    this.code = code;
    this.context = context;
    this.severity = severity;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FluidFlowError);
    }
  }

  /**
   * Convert error to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Create a user-friendly message
   */
  getUserMessage(): string {
    const codeMessages: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.FILE_TOO_LARGE]: 'The file is too large to process.',
      [ErrorCode.PROJECT_NOT_FOUND]: 'The project could not be found.',
      [ErrorCode.AI_RATE_LIMITED]: 'Too many requests. Please wait a moment.',
      [ErrorCode.AI_CONNECTION_FAILED]: 'Could not connect to AI service.',
      [ErrorCode.NETWORK_ERROR]: 'Network connection error.',
      [ErrorCode.TIMEOUT]: 'The operation timed out.',
      [ErrorCode.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded.',
    };

    return codeMessages[this.code] || this.message;
  }
}

/**
 * Check if an error is a FluidFlowError
 */
export function isFluidFlowError(error: unknown): error is FluidFlowError {
  return error instanceof FluidFlowError;
}

/**
 * Convert any error to a FluidFlowError
 *
 * @param error - The error to convert
 * @param defaultCode - Code to use if not a FluidFlowError
 * @param context - Additional context to add
 * @returns A FluidFlowError instance
 */
export function toFluidFlowError(
  error: unknown,
  defaultCode: ErrorCode = ErrorCode.UNKNOWN,
  context: ErrorContext = {}
): FluidFlowError {
  if (isFluidFlowError(error)) {
    // Merge additional context
    return new FluidFlowError(
      error.message,
      error.code,
      { ...error.context, ...context },
      error.severity
    );
  }

  if (error instanceof Error) {
    return new FluidFlowError(error.message, defaultCode, {
      ...context,
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new FluidFlowError(
    String(error),
    defaultCode,
    { ...context, originalValue: error }
  );
}

/**
 * Options for error handling
 */
export interface HandleErrorOptions {
  /** Log to console (default: true) */
  log?: boolean;
  /** Re-throw the error after handling (default: false) */
  rethrow?: boolean;
  /** Additional context to add */
  context?: ErrorContext;
  /** Default error code if unknown */
  defaultCode?: ErrorCode;
}

/**
 * Centralized error handler
 *
 * Logs errors consistently and optionally re-throws.
 *
 * @param error - The error to handle
 * @param source - Where the error occurred (e.g., 'WIP.save', 'AI.generate')
 * @param options - Handling options
 * @returns The FluidFlowError (useful when not re-throwing)
 *
 * @example
 * try {
 *   await saveWIP(projectId, files);
 * } catch (error) {
 *   handleError(error, 'WIP.save');
 *   // Error is logged but not re-thrown - WIP save failure is non-critical
 * }
 *
 * @example
 * try {
 *   await generateCode(prompt);
 * } catch (error) {
 *   handleError(error, 'AI.generate', { rethrow: true });
 *   // Error is logged and re-thrown
 * }
 */
export function handleError(
  error: unknown,
  source: string,
  options: HandleErrorOptions = {}
): FluidFlowError {
  const {
    log = true,
    rethrow = false,
    context = {},
    defaultCode = ErrorCode.UNKNOWN,
  } = options;

  const fluidError = toFluidFlowError(error, defaultCode, {
    ...context,
    source,
  });

  if (log) {
    const logMethod = fluidError.severity === 'warning' ? console.warn : console.error;
    logMethod(`[${source}]`, {
      code: fluidError.code,
      message: fluidError.message,
      context: fluidError.context,
    });
  }

  if (rethrow) {
    throw fluidError;
  }

  return fluidError;
}

/**
 * Check if an error is a transient/retryable error
 *
 * @param error - The error to check
 * @returns true if the error is likely transient and worth retrying
 */
export function isTransientError(error: unknown): boolean {
  if (isFluidFlowError(error)) {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.AI_RATE_LIMITED,
      ErrorCode.SERVER_ERROR,
    ].includes(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('429') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Create an error with specific code (convenience function)
 */
export function createError(
  code: ErrorCode,
  message: string,
  context?: ErrorContext
): FluidFlowError {
  return new FluidFlowError(message, code, context);
}
