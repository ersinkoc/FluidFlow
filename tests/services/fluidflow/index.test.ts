/**
 * FluidFlow Service Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as fluidflow from '../../../services/fluidflow/index';

describe('FluidFlow Service', () => {
  it('should export FluidFlow service functions', () => {
    expect(fluidflow).toBeDefined();
  });
});
