/**
 * AI Provider Storage - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as providerStorage from '../../../services/ai/providerStorage';

describe('AI Provider Storage', () => {
  it('should export provider storage functions', () => {
    expect(providerStorage).toBeDefined();
  });
});
