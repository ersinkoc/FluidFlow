/**
 * AI ProviderManager - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProviderManager from '../../../services/ai/ProviderManager';

describe('AI ProviderManager', () => {
  it('should export ProviderManager', () => {
    expect(ProviderManager).toBeDefined();
  });
});
