/**
 * Safe JSON utilities - Shared between client and server
 *
 * This module provides safe JSON parsing and stringification
 * that handles edge cases like BigInt, Symbol, and malformed JSON.
 */

export interface SafeJsonParseOptions {
  /** Log errors to console (default: true) */
  logErrors?: boolean;
}

export interface SafeJsonStringifyOptions {
  /** Pretty print with this many spaces (default: none) */
  space?: number;
  /** Handle BigInt values (default: true) */
  handleBigInt?: boolean;
  /** String to return if stringify fails */
  fallback?: string;
}

/**
 * Safely parse JSON string with fallback on error
 *
 * @param json - The JSON string to parse (accepts null/undefined)
 * @param fallback - Value to return if parsing fails
 * @param options - Optional configuration
 * @returns Parsed value or fallback
 *
 * @example
 * const data = safeJsonParse(localStorage.getItem('key'), { default: true });
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  fallback: T,
  options: SafeJsonParseOptions = {}
): T {
  const { logErrors = true } = options;

  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    if (logErrors) {
      console.error(
        '[SafeJson] Parse error:',
        error instanceof Error ? error.message : error
      );
    }
    return fallback;
  }
}

/**
 * Safely stringify a value to JSON with fallback on error
 *
 * Handles special cases:
 * - BigInt: Converted to string representation
 * - Symbol: Excluded (same as JSON.stringify default)
 * - undefined/function: Returns fallback
 * - Circular references: Returns fallback
 *
 * @param value - Value to stringify
 * @param optionsOrFallback - Options object or fallback string (for backwards compatibility)
 * @returns JSON string or fallback
 *
 * @example
 * const json = safeJsonStringify({ count: BigInt(123) });
 * // Returns '{"count":"123"}'
 *
 * @example
 * // Legacy API (backwards compatible)
 * const json = safeJsonStringify(obj, '{"error": true}');
 */
export function safeJsonStringify(
  value: unknown,
  optionsOrFallback: SafeJsonStringifyOptions | string = {}
): string {
  // Support legacy API: safeJsonStringify(value, fallbackString)
  const options: SafeJsonStringifyOptions =
    typeof optionsOrFallback === 'string'
      ? { fallback: optionsOrFallback }
      : optionsOrFallback;

  const { space, handleBigInt = true, fallback = '{}' } = options;

  // Handle undefined and functions explicitly - JSON.stringify returns undefined for these
  if (value === undefined || typeof value === 'function') {
    return fallback;
  }

  // Handle Symbol directly at top level
  if (typeof value === 'symbol') {
    return fallback;
  }

  // Handle BigInt directly at top level
  if (typeof value === 'bigint') {
    return `"${value.toString()}"`;
  }

  try {
    // Custom replacer to handle BigInt and Symbol values in nested objects
    const replacer = handleBigInt
      ? (_key: string, val: unknown): unknown => {
          if (typeof val === 'bigint') {
            return val.toString();
          }
          if (typeof val === 'symbol') {
            return undefined; // Symbols are excluded (same as JSON.stringify default)
          }
          return val;
        }
      : undefined;

    const result = JSON.stringify(value, replacer, space);

    // JSON.stringify can return undefined for some edge cases
    if (result === undefined) {
      return fallback;
    }

    return result;
  } catch (error) {
    console.error(
      '[SafeJson] Stringify error:',
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}

/**
 * Parse JSON with null as default fallback
 *
 * @param json - The JSON string to parse
 * @returns Parsed value or null
 */
export function safeJsonParseOrNull<T>(json: string | null | undefined): T | null {
  return safeJsonParse<T | null>(json, null);
}
