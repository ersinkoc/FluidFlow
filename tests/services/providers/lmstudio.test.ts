/**
 * LM Studio Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { LMStudioProvider } from '../../../services/ai/providers/lmstudio';

describe('LMStudioProvider', () => {
  it('should be defined', () => {
    expect(LMStudioProvider).toBeDefined();
  });
});
