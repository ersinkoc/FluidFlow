/**
 * Tests for cleanCode utility functions
 * Tests JSON parsing, PLAN comment handling, and pre-validation
 */

import { describe, it, expect } from 'vitest';
import {
  preValidateJson,
  stripPlanComment,
  safeParseAIResponse,
  cleanGeneratedCode,
  parseMultiFileResponse
} from '../../utils/cleanCode';

describe('cleanCode', () => {
  describe('preValidateJson', () => {
    it('should validate correct JSON', () => {
      const result = preValidateJson('{"key": "value"}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect empty response', () => {
      const result = preValidateJson('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty response');
    });

    it('should handle markdown code blocks', () => {
      const json = '```json\n{"key": "value"}\n```';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
    });

    it('should detect unclosed markdown code blocks', () => {
      const json = '```json\n{"key": "value"}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unclosed markdown code block');
    });

    it('should detect invalid text prefixes', () => {
      const prefixes = ['Here is', 'Sure,', 'I\'ll', 'Let me', 'The following'];
      prefixes.forEach(prefix => {
        const result = preValidateJson(`${prefix} the JSON: {"key": "value"}`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(prefix);
      });
    });

    it('should detect missing opening brace', () => {
      const result = preValidateJson('no json here');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No JSON object found (missing opening brace)');
    });

    it('should fix trailing commas', () => {
      const json = '{"a": 1, "b": 2,}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
      expect(result.fixedJson).toBe('{"a": 1, "b": 2}');
    });

    it('should handle PLAN comment followed by JSON', () => {
      const json = '// PLAN: {"create":[],"update":[],"delete":[],"total":0}\n{"files":{}}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
    });

    it('should provide helpful error context for parse errors', () => {
      const json = '{"key": "value"';
      const result = preValidateJson(json);
      expect(result.valid).toBe(false);
      // Should provide some error context
      expect(result.suggestion).toBeDefined();
    });
  });

  describe('stripPlanComment', () => {
    it('should strip PLAN comment from start', () => {
      const input = '// PLAN: {"create":[],"update":[],"delete":[],"total":0}\n{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should handle PLAN with whitespace before', () => {
      const input = '  // PLAN: {"create":[]}\n{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should return original if no PLAN comment', () => {
      const input = '{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should handle nested braces in PLAN', () => {
      const input = '// PLAN: {"create":["a.tsx"],"update":["b.tsx"],"total":2}\n{"files":{"a.tsx":"code"}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{"a.tsx":"code"}}');
    });

    it('should return empty string for empty input', () => {
      expect(stripPlanComment('')).toBe('');
    });
  });

  describe('safeParseAIResponse', () => {
    it('should parse valid JSON', () => {
      const result = safeParseAIResponse<{ key: string }>('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', () => {
      const result = safeParseAIResponse('not json');
      expect(result).toBeNull();
    });

    it('should handle PLAN comment before JSON', () => {
      const input = '// PLAN: {"create":[]}\n{"explanation": "test"}';
      const result = safeParseAIResponse<{ explanation: string }>(input);
      expect(result).toEqual({ explanation: 'test' });
    });

    it('should extract JSON from markdown code blocks', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = safeParseAIResponse<{ key: string }>(input);
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for empty input', () => {
      expect(safeParseAIResponse('')).toBeNull();
      expect(safeParseAIResponse(null as unknown as string)).toBeNull();
    });
  });

  describe('cleanGeneratedCode', () => {
    it('should remove markdown code blocks', () => {
      const input = '```typescript\nconst x = 1;\n```';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });

    it('should remove various language tags', () => {
      const languages = ['javascript', 'typescript', 'tsx', 'jsx', 'ts', 'js', 'react'];
      languages.forEach(lang => {
        const input = `\`\`\`${lang}\nconst x = 1;\n\`\`\``;
        const result = cleanGeneratedCode(input);
        expect(result).toBe('const x = 1;');
      });
    });

    it('should handle code without language tag', () => {
      const input = '```\nconst x = 1;\n```';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });

    it('should return empty string for empty input', () => {
      expect(cleanGeneratedCode('')).toBe('');
    });

    it('should trim whitespace', () => {
      const input = '  const x = 1;  ';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });
  });

  describe('parseMultiFileResponse', () => {
    it('should parse valid multi-file response', () => {
      const input = `{"files":{"src/App.tsx":"import React from 'react';\\nexport default function App() { return <div>Hello</div>; }"}}`;
      const result = parseMultiFileResponse(input);
      expect(result).not.toBeNull();
      expect(result?.files['src/App.tsx']).toBeDefined();
    });

    it('should handle PLAN comment', () => {
      const input = '// PLAN: {"create":["src/App.tsx"],"update":[],"delete":[],"total":1}\n{"files":{"src/App.tsx":"const App = () => <div>Test</div>;"}}';
      const result = parseMultiFileResponse(input);
      expect(result).not.toBeNull();
      expect(result?.files['src/App.tsx']).toBeDefined();
    });

    it('should extract explanation', () => {
      const input = '{"explanation":"Added component","files":{"src/App.tsx":"const App = () => null;"}}';
      const result = parseMultiFileResponse(input);
      expect(result?.explanation).toBe('Added component');
    });

    it('should handle deletedFiles array', () => {
      // File content must be at least 10 chars to be valid
      const input = '{"files":{"src/App.tsx":"const App = () => null;"},"deletedFiles":["src/old.tsx"]}';
      const result = parseMultiFileResponse(input);
      expect(result?.deletedFiles).toEqual(['src/old.tsx']);
    });

    it('should skip ignored paths', () => {
      // File content must be at least 10 chars to be valid
      const validCode = 'const App = () => null;';
      const input = `{"files":{"src/App.tsx":"${validCode}",".git/config":"${validCode}","node_modules/pkg/index.js":"${validCode}"}}`;
      const result = parseMultiFileResponse(input);
      expect(result?.files['src/App.tsx']).toBeDefined();
      expect(result?.files['.git/config']).toBeUndefined();
      expect(result?.files['node_modules/pkg/index.js']).toBeUndefined();
    });

    it('should throw for empty files object', () => {
      // parseMultiFileResponse throws when no valid files found
      expect(() => parseMultiFileResponse('{"files":{}}')).toThrow('Model returned no code files');
    });

    it('should handle generationMeta', () => {
      const validCode = 'const App = () => null;';
      const input = `{"files":{"src/App.tsx":"${validCode}"},"generationMeta":{"totalFilesPlanned":3,"filesInThisBatch":["src/App.tsx"],"completedFiles":["src/App.tsx"],"remainingFiles":["src/B.tsx","src/C.tsx"],"currentBatch":1,"totalBatches":3,"isComplete":false}}`;
      const result = parseMultiFileResponse(input);
      expect(result?.generationMeta).toBeDefined();
      expect(result?.generationMeta?.currentBatch).toBe(1);
      expect(result?.generationMeta?.totalBatches).toBe(3);
      expect(result?.generationMeta?.isComplete).toBe(false);
    });

    it('should use cleanGeneratedCode on file content', () => {
      // cleanGeneratedCode removes markdown artifacts
      const codeWithMarkers = '```tsx\nconst App = () => null;\n```';
      const cleaned = cleanGeneratedCode(codeWithMarkers);
      expect(cleaned).toBe('const App = () => null;');
      expect(cleaned).not.toContain('```');
    });
  });
});
