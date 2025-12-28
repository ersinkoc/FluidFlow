/**
 * SQL Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as sqlUtils from '../../utils/sqlUtils';

describe('sqlUtils', () => {
  it('should export SQL utility functions', () => {
    expect(sqlUtils).toBeDefined();
  });
});
