/**
 * Cerebras Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as cerebras from '../../../services/ai/providers/cerebras';

describe('Cerebras Provider', () => {
  it('should export Cerebras provider', () => {
    expect(cerebras).toBeDefined();
  });
});
