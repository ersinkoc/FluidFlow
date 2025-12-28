/**
 * Error Context Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as errorContext from '../../utils/errorContext';

describe('Error Context', () => {
  it('should export error context functions', () => {
    expect(errorContext).toBeDefined();
  });
});
