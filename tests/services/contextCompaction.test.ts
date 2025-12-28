/**
 * Context Compaction - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as contextCompaction from '../../services/contextCompaction';

describe('Context Compaction', () => {
  it('should export context compaction utilities', () => {
    expect(contextCompaction).toBeDefined();
  });
});
