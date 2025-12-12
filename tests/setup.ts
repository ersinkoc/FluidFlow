/**
 * Test setup file
 * Configures Vitest testing environment
 */

import { expect } from 'vitest';

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

// Setup custom matcher types
interface CustomMatchers<R = unknown> {
  toBeValidProjectId(): R;
  toBeValidFilePath(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
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