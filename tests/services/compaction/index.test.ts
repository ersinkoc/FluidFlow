/**
 * Compaction Services - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as compaction from '../../../services/compaction/index';

describe('Compaction Services Index', () => {
  it('should export compaction services', () => {
    expect(compaction).toBeDefined();
  });
});
