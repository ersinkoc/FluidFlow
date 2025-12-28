/**
 * Logger - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as logger from '../../utils/logger';

describe('logger', () => {
  it('should export logging functions', () => {
    expect(logger).toBeDefined();
  });
});
