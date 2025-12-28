/**
 * Unified Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as unifiedParser from '../../utils/unifiedParser';

describe('unifiedParser', () => {
  it('should export unified parser functions', () => {
    expect(unifiedParser).toBeDefined();
  });
});
