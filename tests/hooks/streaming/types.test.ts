/**
 * Streaming Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../hooks/streaming/types';

describe('Streaming Types', () => {
  it('should export streaming types', () => {
    expect(types).toBeDefined();
  });
});
