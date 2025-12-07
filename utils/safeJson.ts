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

export function safeJsonStringify(obj: any, fallback: string = '{}'): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.error('JSON stringification failed:', error);
    return fallback;
  }
}

export function safeJsonParseWithDefault<T>(json: string | null | undefined): T | null {
  return safeJsonParse(json, null);
}