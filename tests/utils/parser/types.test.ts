/**
 * Parser Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../utils/parser/types';

describe('Parser Types', () => {
  it('should export parser types', () => {
    expect(types).toBeDefined();
  });
});
