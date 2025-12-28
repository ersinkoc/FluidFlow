/**
 * Bootstrap Script - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as bootstrap from '../../../../utils/sandboxHtml/scripts/bootstrap';

describe('Bootstrap Script', () => {
  it('should export bootstrap utilities', () => {
    expect(bootstrap).toBeDefined();
  });
});
