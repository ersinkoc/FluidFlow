/**
 * AI Provider Factory - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as providerFactory from '../../../services/ai/providerFactory';

describe('AI Provider Factory', () => {
  it('should export provider factory functions', () => {
    expect(providerFactory).toBeDefined();
  });
});
