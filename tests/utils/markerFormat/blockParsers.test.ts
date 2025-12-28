/**
 * Marker Format Block Parsers - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as blockParsers from '../../../utils/markerFormat/blockParsers';

describe('Marker Format Block Parsers', () => {
  it('should export block parsing functions', () => {
    expect(blockParsers).toBeDefined();
  });
});
