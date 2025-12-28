/**
 * Minimax Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as minimax from '../../../services/ai/providers/minimax';

describe('Minimax Provider', () => {
  it('should export Minimax provider', () => {
    expect(minimax).toBeDefined();
  });
});
