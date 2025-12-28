/**
 * useProjectGit Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useProjectGit from '../../hooks/useProjectGit';

describe('useProjectGit', () => {
  it('should export useProjectGit hook', () => {
    expect(useProjectGit).toBeDefined();
  });
});
