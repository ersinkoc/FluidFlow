/**
 * OpenAI Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../../../services/ai/providers/openai';

describe('OpenAIProvider', () => {
  it('should be defined', () => {
    expect(OpenAIProvider).toBeDefined();
  });
});
