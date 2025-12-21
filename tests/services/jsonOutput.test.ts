import { describe, it, expect, vi } from 'vitest';
import {
  getJsonCapability,
  buildJsonSystemInstruction,
  parseJsonResponse,
  prepareJsonRequest,
} from '../../services/ai/utils/jsonOutput';

describe('JSON Output Utilities', () => {
  describe('getJsonCapability', () => {
    it('should return native schema support for OpenAI with static schema', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const capability = getJsonCapability('openai', schema);
      expect(capability.supportsNativeSchema).toBe(true);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(false);
    });

    it('should return fallback for OpenAI with dynamic schema', () => {
      const schema = {
        type: 'object',
        properties: {
          files: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      };
      const capability = getJsonCapability('openai', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return fallback for Z.AI', () => {
      const schema = { type: 'object', properties: {} };
      const capability = getJsonCapability('zai', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return native schema support for Anthropic with static schema', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const capability = getJsonCapability('anthropic', schema);
      expect(capability.supportsNativeSchema).toBe(true);
      expect(capability.supportsJsonObject).toBe(false); // Anthropic only supports full schema, not json_object
      expect(capability.needsPromptGuidance).toBe(false);
    });

    it('should return fallback for Anthropic with dynamic schema', () => {
      const schema = {
        type: 'object',
        properties: {
          files: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      };
      const capability = getJsonCapability('anthropic', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return native schema support for OpenRouter with static schema', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const capability = getJsonCapability('openrouter', schema);
      expect(capability.supportsNativeSchema).toBe(true);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(false);
    });

    it('should return fallback for custom provider', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const capability = getJsonCapability('custom', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(false);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return native schema support for Gemini with static schema (lines 62-66)', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const capability = getJsonCapability('gemini', schema);
      expect(capability.supportsNativeSchema).toBe(true);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(false);
    });

    it('should return fallback for Gemini with dynamic schema', () => {
      const schema = {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      };
      const capability = getJsonCapability('gemini', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return JSON object support for ollama (lines 88-92)', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      const capability = getJsonCapability('ollama', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return JSON object support for lmstudio (lines 88-92)', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      const capability = getJsonCapability('lmstudio', schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should return fallback for unknown provider (lines 113-117)', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      // Use an unknown provider name to trigger default case
      const capability = getJsonCapability('unknown-provider' as any, schema);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(false);
      expect(capability.needsPromptGuidance).toBe(true);
    });

    it('should not require prompt guidance when no schema provided for ollama', () => {
      const capability = getJsonCapability('ollama', undefined);
      expect(capability.supportsNativeSchema).toBe(false);
      expect(capability.supportsJsonObject).toBe(true);
      expect(capability.needsPromptGuidance).toBe(false);
    });
  });

  describe('buildJsonSystemInstruction', () => {
    const baseInstruction = 'You are a helpful assistant.';
    const schema = { type: 'object', properties: { name: { type: 'string' } } };

    it('should not modify instruction for native schema support', () => {
      const capability = { supportsNativeSchema: true, supportsJsonObject: true, needsPromptGuidance: false };
      const result = buildJsonSystemInstruction(baseInstruction, schema, capability);
      expect(result).toBe(baseInstruction);
    });

    it('should add schema guidance for fallback', () => {
      const capability = { supportsNativeSchema: false, supportsJsonObject: true, needsPromptGuidance: true };
      const result = buildJsonSystemInstruction(baseInstruction, schema, capability);
      expect(result).toContain(baseInstruction);
      expect(result).toContain('You MUST respond with valid JSON');
      expect(result).toContain('"type": "object"');
    });

    it('should return schema-only instruction when no base instruction', () => {
      const capability = { supportsNativeSchema: false, supportsJsonObject: true, needsPromptGuidance: true };
      const result = buildJsonSystemInstruction('', schema, capability);
      expect(result).toContain('You MUST respond with valid JSON');
      expect(result.startsWith('\n')).toBe(false);
    });
  });

  describe('parseJsonResponse', () => {
    it('should parse clean JSON for native schema', () => {
      const json = '{"name": "test", "value": 123}';
      const result = parseJsonResponse(json, true);
      expect(result.data).toEqual({ name: 'test', value: 123 });
      expect(result.usedNativeSchema).toBe(true);
      expect(result.neededCleanup).toBe(false);
    });

    it('should handle markdown code blocks for fallback', () => {
      const json = '```json\n{"name": "test"}\n```';
      const result = parseJsonResponse(json, false);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.neededCleanup).toBe(true);
    });

    it('should extract JSON from surrounding text', () => {
      const text = 'Here is the result:\n{"name": "test"}\nDone!';
      const result = parseJsonResponse(text, false);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.neededCleanup).toBe(true);
    });

    it('should fix trailing commas', () => {
      const json = '{"name": "test", "items": [1, 2, 3,]}';
      const result = parseJsonResponse(json, false);
      expect(result.data).toEqual({ name: 'test', items: [1, 2, 3] });
      expect(result.neededCleanup).toBe(true);
    });

    it('should preserve raw text in result', () => {
      const original = '```json\n{"test": true}\n```';
      const result = parseJsonResponse(original, false);
      expect(result.rawText).toBe(original);
    });

    it('should throw on invalid JSON', () => {
      const invalid = 'not json at all';
      expect(() => parseJsonResponse(invalid, false)).toThrow();
    });

    it('should extract JSON array from surrounding text', () => {
      const text = 'Here is the array:\n[1, 2, 3, 4]\nDone!';
      const result = parseJsonResponse<number[]>(text, false);
      expect(result.data).toEqual([1, 2, 3, 4]);
      expect(result.neededCleanup).toBe(true);
    });

    it('should repair truncated JSON object', () => {
      // Warning will be logged for truncated JSON
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const truncated = '{"name": "test", "nested": {"value": 123';
      const result = parseJsonResponse(truncated, false);
      expect(result.data).toHaveProperty('name', 'test');
      expect(result.neededCleanup).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('should handle simple JSON array extraction', () => {
      // Simple array without objects (objects take precedence in regex)
      const text = '[1, 2, 3, 4, 5]';
      const result = parseJsonResponse<number[]>(text, false);
      expect(result.data).toHaveLength(5);
      expect(result.data[0]).toBe(1);
    });
  });

  describe('prepareJsonRequest', () => {
    const schema = {
      type: 'object',
      properties: { result: { type: 'string' } },
      additionalProperties: false,
    };

    it('should return native schema flag for OpenAI', () => {
      const req = prepareJsonRequest('openai', 'Base instruction', schema);
      expect(req.useNativeSchema).toBe(true);
      expect(req.useJsonObject).toBe(false);
      expect(req.systemInstruction).toBe('Base instruction'); // No schema added
    });

    it('should return json_object flag for Z.AI', () => {
      const req = prepareJsonRequest('zai', 'Base instruction', schema);
      expect(req.useNativeSchema).toBe(false);
      expect(req.useJsonObject).toBe(true);
      expect(req.systemInstruction).toContain('You MUST respond with valid JSON');
    });

    it('should provide working parse function', () => {
      const req = prepareJsonRequest('zai', '', schema);
      const result = req.parse<{ result: string }>('{"result": "success"}');
      expect(result.data.result).toBe('success');
    });
  });

  describe('parseJsonResponse - additional coverage', () => {
    it('should warn and fallback when native schema response is invalid JSON (line 184)', () => {
      // This triggers line 183-184: native schema response that fails to parse
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Pass usedNativeSchema=true but with invalid JSON that needs cleanup
      const invalidNative = '{"name": "test" invalid}';
      // This will fail the native parse and fall through to cleanup
      expect(() => parseJsonResponse(invalidNative, true)).toThrow();

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Native schema response failed')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle partial markdown code blocks (lines 197-199)', () => {
      // Partial markdown block that doesn't match the full regex
      // Starts with ``` but doesn't end properly
      const partialMarkdown = '```json\n{"test": true}';
      const result = parseJsonResponse(partialMarkdown, false);
      expect(result.data).toEqual({ test: true });
      expect(result.neededCleanup).toBe(true);
    });

    it('should handle code block with only opening backticks', () => {
      // Another partial case - code block that starts but doesn't close
      const partial = '```json\n{"key": "value"}  ';
      const result = parseJsonResponse(partial, false);
      expect(result.data).toEqual({ key: 'value' });
      expect(result.neededCleanup).toBe(true);
    });

    it('should preserve escaped quotes without modification (line 239)', () => {
      // Test with properly escaped quotes - the code path does nothing (no-op)
      const jsonWithEscapes = '{"message": "He said \\"hello\\""}';
      const result = parseJsonResponse(jsonWithEscapes, false);
      expect((result.data as { message: string }).message).toBe('He said "hello"');
    });

    it('should handle JSON with backslash but no double escape', () => {
      // Test for the escape handling branch
      const jsonWithBackslash = '{"path": "C:\\\\Users\\\\test"}';
      const result = parseJsonResponse(jsonWithBackslash, false);
      expect((result.data as { path: string }).path).toBe('C:\\Users\\test');
    });
  });
});
