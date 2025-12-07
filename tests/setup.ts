/**
 * Test setup file
 * Configures Vitest testing environment
 */

import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods in tests
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';

// Setup test globals
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeValidProjectId(): T;
      toBeValidFilePath(): T;
    }
  }
}

// Custom matchers (if needed)
expect.extend({
  toBeValidProjectId(received) {
    const isValid = /^[a-zA-Z0-9_-]+$/.test(received);
    return {
      message: () =>
        `expected ${received} to be a valid project ID`,
      pass: isValid,
    };
  },
  toBeValidFilePath(received) {
    const hasTraversal = received.includes('..') || received.includes('~');
    return {
      message: () =>
        `expected ${received} to be a valid file path without traversal`,
      pass: !hasTraversal,
    };
  },
});