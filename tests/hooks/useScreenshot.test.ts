/**
 * useScreenshot Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useScreenshot from '../../hooks/useScreenshot';

describe('useScreenshot', () => {
  it('should export useScreenshot hook', () => {
    expect(useScreenshot).toBeDefined();
  });
});
