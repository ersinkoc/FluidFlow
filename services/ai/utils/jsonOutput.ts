/**
 * JSON Output Handling Utilities
 *
 * Provides a unified way to handle JSON responses from AI providers,
 * whether they support native JSON schema enforcement or need fallback parsing.
 *
 * Two strategies:
 * 1. Native: Provider enforces schema at API level (Gemini, OpenAI)
 *    - Clean JSON response, direct parse
 * 2. Fallback: Schema included in system prompt as guidance
 *    - May have markdown, extra text, needs cleanup
 */

import type { ProviderType } from '../types';
import { supportsNativeSchema, schemaHasDynamicKeys } from './schemas';

/**
 * JSON output capability for a provider/model combination
 */
export interface JsonCapability {
  /** Supports strict JSON schema enforcement (json_schema type) */
  supportsNativeSchema: boolean;
  /** Supports basic JSON object mode (json_object type) */
  supportsJsonObject: boolean;
  /** Needs schema in system prompt as fallback */
  needsPromptGuidance: boolean;
}

/**
 * Result of JSON parsing with metadata
 */
export interface JsonParseResult<T = unknown> {
  /** Parsed data */
  data: T;
  /** Whether native schema was used */
  usedNativeSchema: boolean;
  /** Whether cleanup was needed */
  neededCleanup: boolean;
  /** Original raw text (for debugging) */
  rawText: string;
}

/**
 * Get JSON output capability for a provider/schema combination
 */
export function getJsonCapability(
  providerType: ProviderType,
  schema?: Record<string, unknown>
): JsonCapability {
  // Check if this specific schema can use native enforcement
  const canUseNative = schema ? supportsNativeSchema(providerType, schema) : false;

  switch (providerType) {
    case 'openai':
      return {
        supportsNativeSchema: canUseNative,
        supportsJsonObject: true,
        needsPromptGuidance: !canUseNative && !!schema,
      };

    case 'gemini':
      return {
        supportsNativeSchema: canUseNative,
        supportsJsonObject: true,
        needsPromptGuidance: !canUseNative && !!schema,
      };

    case 'anthropic':
      // Anthropic now supports native JSON schema via structured-outputs-2025-11-13 beta
      // Requires additionalProperties: false on all objects (same as OpenAI)
      return {
        supportsNativeSchema: canUseNative,
        supportsJsonObject: false, // No json_object mode, only full schema
        needsPromptGuidance: !canUseNative && !!schema,
      };

    case 'zai':
      // Z.AI supports json_object but not strict schema enforcement
      return {
        supportsNativeSchema: false,
        supportsJsonObject: true,
        needsPromptGuidance: !!schema,
      };

    case 'ollama':
    case 'lmstudio':
      // Local models vary - assume basic JSON object support
      return {
        supportsNativeSchema: false,
        supportsJsonObject: true,
        needsPromptGuidance: !!schema,
      };

    case 'openrouter':
      // OpenRouter supports native JSON schema for compatible models
      // Uses same format as OpenAI (json_schema with strict: true)
      // Will error if model doesn't support it - that's expected behavior
      return {
        supportsNativeSchema: canUseNative,
        supportsJsonObject: true,
        needsPromptGuidance: !canUseNative && !!schema,
      };

    case 'custom':
      // Unknown capability - use conservative fallback
      return {
        supportsNativeSchema: false,
        supportsJsonObject: false,
        needsPromptGuidance: !!schema,
      };

    default:
      return {
        supportsNativeSchema: false,
        supportsJsonObject: false,
        needsPromptGuidance: !!schema,
      };
  }
}

/**
 * Build system instruction with optional JSON schema guidance
 *
 * @param baseInstruction - Original system instruction
 * @param schema - JSON schema for the expected response
 * @param capability - Provider's JSON capability
 * @returns Modified system instruction
 */
export function buildJsonSystemInstruction(
  baseInstruction: string,
  schema: Record<string, unknown> | undefined,
  capability: JsonCapability
): string {
  // If native schema is supported, don't bloat the system prompt
  if (capability.supportsNativeSchema || !schema) {
    return baseInstruction;
  }

  // Add schema as instruction for fallback
  const schemaInstruction = `

You MUST respond with valid JSON that follows this exact schema:
${JSON.stringify(schema, null, 2)}

IMPORTANT:
- Output ONLY the JSON object, no other text
- Do not wrap in markdown code blocks
- Ensure all required fields are present
- Use correct data types as specified`;

  return baseInstruction
    ? baseInstruction + schemaInstruction
    : schemaInstruction.trim();
}

/**
 * Parse JSON response from AI provider
 *
 * @param responseText - Raw response text from AI
 * @param usedNativeSchema - Whether native schema enforcement was used
 * @returns Parsed JSON with metadata
 */
export function parseJsonResponse<T = unknown>(
  responseText: string,
  usedNativeSchema: boolean
): JsonParseResult<T> {
  const rawText = responseText;
  let text = responseText.trim();
  let neededCleanup = false;

  // Native schema should produce clean JSON
  if (usedNativeSchema) {
    try {
      return {
        data: JSON.parse(text) as T,
        usedNativeSchema: true,
        neededCleanup: false,
        rawText,
      };
    } catch (e) {
      // Unexpected - native schema should always produce valid JSON
      // Fall through to cleanup logic
      console.warn('[jsonOutput] Native schema response failed direct parse, attempting cleanup');
    }
  }

  // Fallback: clean up potential formatting issues

  // 1. Remove markdown code blocks
  if (text.startsWith('```')) {
    const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1];
      neededCleanup = true;
    } else {
      // Partial match - remove opening/closing
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      neededCleanup = true;
    }
  }

  // 2. Remove leading/trailing text outside JSON
  text = text.trim();

  // 3. Try to extract JSON object if there's surrounding text
  if (!text.startsWith('{') && !text.startsWith('[')) {
    // Look for JSON object
    const objectMatch = text.match(/(\{[\s\S]*\})/);
    if (objectMatch) {
      text = objectMatch[1];
      neededCleanup = true;
    } else {
      // Look for JSON array
      const arrayMatch = text.match(/(\[[\s\S]*\])/);
      if (arrayMatch) {
        text = arrayMatch[1];
        neededCleanup = true;
      }
    }
  }

  // 4. Handle truncated JSON (best effort)
  if (text.startsWith('{') && !text.endsWith('}')) {
    // Count braces to find potential truncation
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      // Try to close truncated JSON
      text = text + '}'.repeat(openBraces - closeBraces);
      neededCleanup = true;
      console.warn('[jsonOutput] Attempted to repair truncated JSON object');
    }
  }

  // 5. Handle common escape issues
  // Some models escape quotes incorrectly
  if (text.includes('\\"') && !text.includes('\\\\')) {
    // This is probably correct escaping, leave it
  }

  // Parse the cleaned text
  try {
    return {
      data: JSON.parse(text) as T,
      usedNativeSchema,
      neededCleanup,
      rawText,
    };
  } catch (parseError) {
    // Last resort: try to fix common JSON issues
    let fixedText = text;

    // Fix trailing commas (common LLM mistake)
    fixedText = fixedText.replace(/,(\s*[}\]])/g, '$1');
    neededCleanup = true;

    // Fix unquoted keys (rare but possible)
    fixedText = fixedText.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try {
      return {
        data: JSON.parse(fixedText) as T,
        usedNativeSchema,
        neededCleanup: true,
        rawText,
      };
    } catch {
      // Give up - throw original error with context
      const error = parseError instanceof Error ? parseError : new Error('JSON parse failed');
      error.message = `JSON parse failed: ${error.message}\nRaw text (first 500 chars): ${rawText.slice(0, 500)}`;
      throw error;
    }
  }
}

/**
 * Check if a schema has dynamic keys (uses additionalProperties)
 * Re-exported for convenience
 */
export { schemaHasDynamicKeys };

/**
 * High-level helper: prepare request and get parser for JSON output
 *
 * Usage:
 * ```ts
 * const { systemInstruction, useNativeSchema, parse } = prepareJsonRequest(
 *   providerType,
 *   baseInstruction,
 *   schema
 * );
 *
 * // Use systemInstruction in request
 * // Set response_format based on provider's capability
 * // After response:
 * const result = parse<MyType>(responseText);
 * ```
 */
export function prepareJsonRequest(
  providerType: ProviderType,
  baseInstruction: string,
  schema?: Record<string, unknown>
) {
  const capability = getJsonCapability(providerType, schema);

  const systemInstruction = buildJsonSystemInstruction(
    baseInstruction,
    schema,
    capability
  );

  const useNativeSchema = capability.supportsNativeSchema;
  const useJsonObject = capability.supportsJsonObject && !useNativeSchema;

  return {
    /** Modified system instruction (may include schema guidance) */
    systemInstruction,
    /** Whether to use native JSON schema in API request */
    useNativeSchema,
    /** Whether to use json_object mode (less strict) */
    useJsonObject,
    /** JSON capability info */
    capability,
    /** Parser function bound to the right settings */
    parse: <T = unknown>(responseText: string): JsonParseResult<T> =>
      parseJsonResponse<T>(responseText, useNativeSchema),
  };
}
