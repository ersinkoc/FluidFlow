/**
 * FluidFlow Defaults - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as defaults from '../../../services/fluidflow/defaults';

describe('FluidFlow Defaults', () => {
  it('should export default values', () => {
    expect(defaults).toBeDefined();
  });
});
