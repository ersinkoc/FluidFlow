/**
 * Plan Parsers - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as planParsers from '../../../hooks/streaming/planParsers';

describe('Plan Parsers', () => {
  it('should export plan parsers', () => {
    expect(planParsers).toBeDefined();
  });
});
