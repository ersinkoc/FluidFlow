/**
 * Errors Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as errors from '../../utils/errors';

describe('Errors', () => {
  it('should export error utilities', () => {
    expect(errors).toBeDefined();
  });
});
