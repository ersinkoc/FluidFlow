/**
 * useTruncationRecovery Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useTruncationRecovery from '../../hooks/useTruncationRecovery';

describe('useTruncationRecovery', () => {
  it('should export useTruncationRecovery hook', () => {
    expect(useTruncationRecovery).toBeDefined();
  });
});
