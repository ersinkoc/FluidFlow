/**
 * Fallback Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as fallbackParser from '../../../utils/parser/fallbackParser';

describe('Fallback Parser', () => {
  it('should export fallback parsing functions', () => {
    expect(fallbackParser).toBeDefined();
  });
});
