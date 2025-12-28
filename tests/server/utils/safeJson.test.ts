/**
 * Server SafeJSON Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as safeJson from '../../../server/utils/safeJson';

describe('server/utils/safeJson', () => {
  it('should export JSON utilities', () => {
    expect(safeJson).toBeDefined();
  });
});
