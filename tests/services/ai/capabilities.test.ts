/**
 * AI Capabilities - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as capabilities from '../../../services/ai/capabilities';

describe('AI Capabilities', () => {
  it('should export capabilities functions', () => {
    expect(capabilities).toBeDefined();
  });
});
