/**
 * Context Export - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as contextExport from '../../services/contextExport';

describe('Context Export', () => {
  it('should export context export utilities', () => {
    expect(contextExport).toBeDefined();
  });
});
