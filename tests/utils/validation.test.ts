/**
 * Tests for validation utility
 * Tests BUG-008: Path Traversal Vulnerability and other input validation
 */

import { describe, it, expect } from 'vitest';
import { validateFilePath, validateProjectId, sanitizeInput, validateFileSize, validateMimeType } from '../../utils/validation';

describe('validation', () => {
  describe('validateFilePath', () => {
    it('should accept valid file paths', () => {
      expect(validateFilePath('src/components/App.tsx')).toBe('src/components/App.tsx');
      expect(validateFilePath('package.json')).toBe('package.json');
      expect(validateFilePath('README.md')).toBe('README.md');
    });

    it('should reject paths with directory traversal', () => {
      expect(() => validateFilePath('../../../etc/passwd')).toThrow('Path traversal detected');
      expect(() => validateFilePath('src/../../../secret')).toThrow('Path traversal detected');
      expect(() => validateFilePath('~/../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('should reject null or empty paths', () => {
      expect(() => validateFilePath('')).toThrow('Invalid file path');
      expect(() => validateFilePath(null as any)).toThrow('Invalid file path');
      expect(() => validateFilePath(undefined as any)).toThrow('Invalid file path');
    });

    it('should resolve relative to base path', () => {
      const result = validateFilePath('src/App.tsx', '/projects/myproject');
      expect(result).toBe('src/App.tsx');
    });

    it('should reject paths outside base directory', () => {
      expect(() =>
        validateFilePath('../../../etc/passwd', '/projects/myproject')
      ).toThrow('Path is outside allowed directory');
    });
  });

  describe('validateProjectId', () => {
    it('should accept valid project IDs', () => {
      expect(validateProjectId('myproject123')).toBe(true);
      expect(validateProjectId('my_project')).toBe(true);
      expect(validateProjectId('my-project')).toBe(true);
      expect(validateProjectId('project123ABC')).toBe(true);
    });

    it('should reject invalid project IDs', () => {
      expect(validateProjectId('')).toBe(false);
      expect(validateProjectId('my project')).toBe(false);
      expect(validateProjectId('my/project')).toBe(false);
      expect(validateProjectId('my@project')).toBe(false);
      expect(validateProjectId(null as any)).toBe(false);
      expect(validateProjectId(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML characters', () => {
      expect(sanitizeInput('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(sanitizeInput('Hello <world> & "everyone"'))
        .toBe('Hello &lt;world&gt; &amp; &quot;everyone&quot;');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeInput(null as any)).toBe('');
      expect(sanitizeInput(undefined as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should escape single quotes and forward slashes', () => {
      expect(sanitizeInput("it's a test/path"))
        .toBe('it&#x27;s a test&#x2F;path');
    });
  });

  describe('validateFileSize', () => {
    it('should accept valid file sizes', () => {
      expect(validateFileSize(1024)).toBe(true); // 1KB
      expect(validateFileSize(10 * 1024 * 1024)).toBe(true); // 10MB
    });

    it('should reject oversized files', () => {
      expect(validateFileSize(20 * 1024 * 1024)).toBe(false); // 20MB
    });

    it('should reject invalid sizes', () => {
      expect(validateFileSize(0)).toBe(false);
      expect(validateFileSize(-1)).toBe(false);
    });

    it('should use custom max size', () => {
      expect(validateFileSize(5 * 1024 * 1024, 10 * 1024 * 1024)).toBe(true);
      expect(validateFileSize(15 * 1024 * 1024, 10 * 1024 * 1024)).toBe(false);
    });
  });

  describe('validateMimeType', () => {
    it('should accept allowed MIME types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'text/plain'];
      expect(validateMimeType('image/jpeg', allowedTypes)).toBe(true);
      expect(validateMimeType('image/png', allowedTypes)).toBe(true);
      expect(validateMimeType('text/plain', allowedTypes)).toBe(true);
    });

    it('should reject disallowed MIME types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'text/plain'];
      expect(validateMimeType('application/pdf', allowedTypes)).toBe(false);
      expect(validateMimeType('image/svg+xml', allowedTypes)).toBe(false);
    });
  });
});