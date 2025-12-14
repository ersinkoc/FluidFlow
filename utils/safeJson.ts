/**
 * Safe JSON parsing utilities with error handling
 */

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('JSON parsing failed:', error);
    return fallback;
  }
}

export function safeJsonStringify(obj: unknown, fallback: string = '{}'): string {
  // Handle undefined and functions explicitly - JSON.stringify returns undefined for these
  if (obj === undefined || typeof obj === 'function') {
    return fallback;
  }

  // Handle Symbol directly at top level
  if (typeof obj === 'symbol') {
    return fallback;
  }

  // BUG-021 FIX: Handle BigInt directly at top level
  // Return quoted string directly instead of double-stringifying
  if (typeof obj === 'bigint') {
    return `"${obj.toString()}"`;
  }

  try {
    // JSON-004 fix: Custom replacer to handle BigInt and Symbol values in nested objects
    const replacer = (_key: string, value: unknown): unknown => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (typeof value === 'symbol') {
        return undefined; // Symbols are excluded (same as JSON.stringify default)
      }
      return value;
    };

    const result = JSON.stringify(obj, replacer);
    // JSON.stringify can return undefined for some edge cases
    if (result === undefined) {
      return fallback;
    }
    return result;
  } catch (error) {
    console.error('JSON stringification failed:', error);
    return fallback;
  }
}

export function safeJsonParseWithDefault<T>(json: string | null | undefined): T | null {
  return safeJsonParse(json, null);
}