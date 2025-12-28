/**
 * FluidFlow Config - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as fluidflowConfig from '../../services/fluidflowConfig';

describe('FluidFlow Config', () => {
  it('should export configuration functions', () => {
    expect(fluidflowConfig).toBeDefined();
  });
});
