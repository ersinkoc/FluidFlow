/**
 * AI Service Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as aiService from '../../../services/ai/index';

describe('AI Service', () => {
  it('should export AI service functions', () => {
    expect(aiService).toBeDefined();
  });
});
