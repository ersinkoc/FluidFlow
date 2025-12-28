/**
 * Marker Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as markerParser from '../../../utils/parser/markerParser';

describe('Marker Parser', () => {
  it('should export marker parser', () => {
    expect(markerParser).toBeDefined();
  });
});
