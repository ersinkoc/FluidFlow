/**
 * Compaction Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../services/compaction/types';

describe('Compaction Types', () => {
  it('should export compaction types', () => {
    expect(types).toBeDefined();
  });
});
