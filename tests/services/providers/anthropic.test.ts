/**
 * Anthropic Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../../../services/ai/providers/anthropic';

describe('AnthropicProvider', () => {
  it('should be defined', () => {
    expect(AnthropicProvider).toBeDefined();
  });
});
