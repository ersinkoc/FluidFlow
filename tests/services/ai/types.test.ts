/**
 * AI Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as aiTypes from '../../../services/ai/types';

describe('AI Types', () => {
  it('should export AI types', () => {
    expect(aiTypes).toBeDefined();
  });
});
