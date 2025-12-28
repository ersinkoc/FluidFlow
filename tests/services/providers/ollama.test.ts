/**
 * Ollama Provider - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../../../services/ai/providers/ollama';

describe('OllamaProvider', () => {
  it('should be defined', () => {
    expect(OllamaProvider).toBeDefined();
  });
});
