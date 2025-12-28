/**
 * AI Retry Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as retry from '../../../../services/ai/utils/retry';

describe('ai/utils/retry', () => {
  it('should export retry utilities', () => {
    expect(retry).toBeDefined();
  });
});
