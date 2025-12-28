/**
 * FluidFlow Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../services/fluidflow/types';

describe('FluidFlow Types', () => {
  it('should export FluidFlow types', () => {
    expect(types).toBeDefined();
  });
});
