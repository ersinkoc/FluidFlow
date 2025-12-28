/**
 * MarkerFormat Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../utils/markerFormat/types';

describe('MarkerFormat Types', () => {
  it('should export markerFormat types', () => {
    expect(types).toBeDefined();
  });
});
