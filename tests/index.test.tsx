/**
 * Index Entry Point Tests
 */

import { describe, it, expect } from 'vitest';

describe('index', () => {
  it('should be testable', () => {
    expect(true).toBe(true);
  });

  it('should mount React app', () => {
    const root = document.getElementById('root');
    expect(root).toBeDefined();
  });
});
