/**
 * Marker Format File Parsers - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as fileParsers from '../../../utils/markerFormat/fileParsers';

describe('Marker Format File Parsers', () => {
  it('should export file parsing functions', () => {
    expect(fileParsers).toBeDefined();
  });
});
