/**
 * ZAI Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { ZAIProvider } from '../../../services/ai/providers/zai';

describe('ZAIProvider', () => {
  it('should be defined', () => {
    expect(ZAIProvider).toBeDefined();
  });
});
