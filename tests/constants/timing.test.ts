/**
 * Timing Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as timing from '../../constants/timing';

describe('Timing Constants', () => {
  it('should export timing constants', () => {
    expect(timing).toBeDefined();
  });
});
