/**
 * Limits Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as limits from '../../constants/limits';

describe('Limits Constants', () => {
  it('should export limits constants', () => {
    expect(limits).toBeDefined();
  });
});
