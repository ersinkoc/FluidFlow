/**
 * Types Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../types/index';

describe('Types Index', () => {
  it('should export types', () => {
    expect(types).toBeDefined();
  });
});
