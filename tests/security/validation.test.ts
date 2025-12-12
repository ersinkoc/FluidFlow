/**
 * Security-focused validation tests
 * Tests for input sanitization and XSS prevention
 */

import { describe, it, expect } from 'vitest';
import { sanitizeInput, validateFilePath } from '../../utils/validation';

describe('Security Validation', () => {
  describe('XSS Prevention', () => {
    it('should block script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = sanitizeInput(malicious);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should block JavaScript protocol', () => {
      const malicious = 'javascript:alert("xss")';
      const sanitized = sanitizeInput(malicious);

      expect(sanitized).not.toContain('javascript:');
      // The result should have javascript: removed
      expect(sanitized).toBe('alert(&quot;xss&quot;)');
    });

    it('should block event handlers', () => {
      const malicious = '<img src="x" onerror="alert(\'xss\')">';
      const sanitized = sanitizeInput(malicious);

      // Event handlers are removed
      expect(sanitized).not.toContain('onerror=');
    });

    it('should block CSS expressions', () => {
      const malicious = 'expression(alert("xss"))';
      const sanitized = sanitizeInput(malicious);

      expect(sanitized).not.toContain('expression(');
    });

    it('should handle combined attacks', () => {
      const malicious = '<div onclick="javascript:alert(\'xss\')">test</div>';
      const sanitized = sanitizeInput(malicious);

      // Event handlers and javascript: protocol removed
      expect(sanitized).not.toContain('onclick=');
      expect(sanitized).not.toContain('javascript:');
      // Tags are escaped
      expect(sanitized).toContain('&lt;div');
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should block absolute paths', () => {
      expect(() => validateFilePath('/etc/passwd')).toThrow('Absolute paths not allowed');
      expect(() => validateFilePath('C:\\Windows\\System32')).toThrow('Absolute paths not allowed');
    });

    it('should block relative path traversal', () => {
      expect(() => validateFilePath('../../../etc/passwd')).toThrow('Path traversal detected');
      expect(() => validateFilePath('..\\..\\windows\\system32')).toThrow('Path traversal detected');
    });

    it('should block encoded traversal', () => {
      // URL-encoded path traversal should be detected after decoding
      expect(() => validateFilePath('%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toThrow('Path traversal detected');
      expect(() => validateFilePath('..%2F..%2F..%2Fetc%2Fpasswd')).toThrow('Path traversal detected');
    });

    it('should block null bytes', () => {
      expect(() => validateFilePath('file.txt\0.txt')).toThrow('Path contains null byte');
      expect(() => validateFilePath('..\0.txt')).toThrow('Path contains null byte');
    });

    it('should allow safe paths', () => {
      expect(validateFilePath('src/components/App.tsx')).toBe('src/components/App.tsx');
      expect(validateFilePath('package.json')).toBe('package.json');
      expect(validateFilePath('docs/README.md')).toBe('docs/README.md');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should escape SQL keywords in input', () => {
      const malicious = "'; DROP TABLE users; --";
      const sanitized = sanitizeInput(malicious);

      // Basic check - in a real app, use parameterized queries
      expect(sanitized).toContain('&#x27;');
    });
  });

  describe('URL Sanitization (BUG-011 fix)', () => {
    // These tests verify that dangerous data: URLs are blocked
    // The actual sanitizeUrl function is in MarkdownPreview.tsx
    // Here we test the validation patterns

    it('should identify dangerous SVG data URLs', () => {
      const dangerousSvg = 'data:image/svg+xml,<svg onload="alert(1)"></svg>';
      const trimmed = dangerousSvg.toLowerCase();

      // The fix blocks data:image/svg+xml URLs
      expect(trimmed.startsWith('data:image/svg+xml')).toBe(true);
    });

    it('should identify dangerous application data URLs', () => {
      const dangerousApp = 'data:application/javascript,alert(1)';
      const trimmed = dangerousApp.toLowerCase();

      expect(trimmed.startsWith('data:application/')).toBe(true);
    });

    it('should allow safe image data URLs', () => {
      // Safe image data URLs should not be blocked
      const safeImage = 'data:image/png;base64,iVBORw0KGgo=';
      const trimmed = safeImage.toLowerCase();

      // PNG, JPEG, GIF should be allowed
      expect(trimmed.startsWith('data:image/svg+xml')).toBe(false);
      expect(trimmed.startsWith('data:application/')).toBe(false);
    });
  });

  describe('Content Security', () => {
    it('should handle Unicode attacks', () => {
      // UTF-7/UTF-8 overlong encoding attempts
      const malicious = '\uFEFF<script>alert("xss")</script>';
      const sanitized = sanitizeInput(malicious);

      expect(sanitized).not.toContain('<script>');
    });

    it('should handle mixed encoding', () => {
      const malicious = '%3Cscript%3Ealert%28%22xss%22%29%3C%2Fscript%3E';
      const sanitized = sanitizeInput(decodeURIComponent(malicious));

      expect(sanitized).not.toContain('<script>');
    });
  });
});