/**
 * Context Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../services/context/types';

describe('Context Types', () => {
  it('should export context types', () => {
    expect(types).toBeDefined();
  });
});
