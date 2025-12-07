/**
 * Tests for safeJson utility
 * Tests BUG-004: JSON Parsing Without Try-Catch
 */

import { describe, it, expect } from 'vitest';
import { safeJsonParse, safeJsonStringify } from '../../utils/safeJson';

describe('safeJson', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"name": "test", "value": 123}';
      const result = safeJsonParse(json, { default: true });

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return fallback for invalid JSON', () => {
      const invalidJson = '{"name": "test", "value":}';
      const fallback = { error: true };
      const result = safeJsonParse(invalidJson, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for null input', () => {
      const fallback = { error: true };
      const result = safeJsonParse(null, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for undefined input', () => {
      const fallback = { error: true };
      const result = safeJsonParse(undefined, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { error: true };
      const result = safeJsonParse('', fallback);

      expect(result).toEqual(fallback);
    });

    it('should parse numbers and booleans', () => {
      expect(safeJsonParse('123', 0)).toBe(123);
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('false', true)).toBe(false);
    });

    it('should handle arrays', () => {
      const json = '[1, 2, 3, "test"]';
      const result = safeJsonParse(json, []);

      expect(result).toEqual([1, 2, 3, 'test']);
    });
  });

  describe('safeJsonStringify', () => {
    it('should stringify valid objects', () => {
      const obj = { name: 'test', value: 123 };
      const result = safeJsonStringify(obj);

      expect(result).toBe('{"name":"test","value":123}');
    });

    it('should return fallback for circular references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const fallback = '{"error":"circular"}';
      const result = safeJsonStringify(obj, fallback);

      expect(result).toBe(fallback);
    });

    it('should handle null and undefined', () => {
      expect(safeJsonStringify(null)).toBe('null');
      expect(safeJsonStringify(undefined)).toBe('undefined');
    });

    it('should handle primitive values', () => {
      expect(safeJsonStringify('test')).toBe('"test"');
      expect(safeJsonStringify(123)).toBe('123');
      expect(safeJsonStringify(true)).toBe('true');
    });

    it('should handle functions', () => {
      const fn = () => {};
      const fallback = '{"error":"function"}';
      const result = safeJsonStringify(fn, fallback);

      expect(result).toBe(fallback);
    });
  });
});