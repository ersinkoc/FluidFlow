/**
 * Error Analytics - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as analytics from '../../../services/errorFix/analytics';

describe('Error Analytics', () => {
  it('should export error analytics', () => {
    expect(analytics).toBeDefined();
  });
});
