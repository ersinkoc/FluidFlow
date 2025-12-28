/**
 * Hooks Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as hooks from '../../hooks/index';

describe('Hooks Index', () => {
  it('should export hooks', () => {
    expect(hooks).toBeDefined();
  });
});
