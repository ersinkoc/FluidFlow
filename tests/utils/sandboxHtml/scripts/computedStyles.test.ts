/**
 * Computed Styles Script - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as computedStyles from '../../../../utils/sandboxHtml/scripts/computedStyles';

describe('Computed Styles Script', () => {
  it('should export computed styles utilities', () => {
    expect(computedStyles).toBeDefined();
  });
});
