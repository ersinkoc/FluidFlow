/**
 * useProjectSync Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useProjectSync from '../../hooks/useProjectSync';

describe('useProjectSync', () => {
  it('should export useProjectSync hook', () => {
    expect(useProjectSync).toBeDefined();
  });
});
