/**
 * Import Mappings Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as importMappings from '../../utils/importMappings';

describe('Import Mappings', () => {
  it('should export import mapping functions', () => {
    expect(importMappings).toBeDefined();
  });
});
