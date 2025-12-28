/**
 * useProjectCrud Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useProjectCrud from '../../hooks/useProjectCrud';

describe('useProjectCrud', () => {
  it('should export useProjectCrud hook', () => {
    expect(useProjectCrud).toBeDefined();
  });
});
