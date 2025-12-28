/**
 * MarkerFormat Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as markerFormat from '../../../utils/markerFormat/index';

describe('MarkerFormat Index', () => {
  it('should export markerFormat module', () => {
    expect(markerFormat).toBeDefined();
  });
});
