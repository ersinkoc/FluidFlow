/**
 * ErrorFix Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../services/errorFix/types';

describe('ErrorFix Types', () => {
  it('should export errorFix types', () => {
    expect(types).toBeDefined();
  });
});
