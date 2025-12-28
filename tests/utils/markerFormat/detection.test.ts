/**
 * Marker Format Detection - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as detection from '../../../utils/markerFormat/detection';

describe('Marker Format Detection', () => {
  it('should export format detection functions', () => {
    expect(detection).toBeDefined();
  });
});
