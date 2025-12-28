/**
 * API Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as apiTypes from '../../../services/api/types';

describe('API Types', () => {
  it('should export API types', () => {
    expect(apiTypes).toBeDefined();
  });
});
