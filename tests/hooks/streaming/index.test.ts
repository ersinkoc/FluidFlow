/**
 * Streaming Hooks - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as streaming from '../../../hooks/streaming/index';

describe('Streaming Hooks Index', () => {
  it('should export streaming hooks', () => {
    expect(streaming).toBeDefined();
  });
});
