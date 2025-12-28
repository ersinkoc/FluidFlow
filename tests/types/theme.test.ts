/**
 * Theme Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as theme from '../../types/theme';

describe('Theme Types', () => {
  it('should export theme types', () => {
    expect(theme).toBeDefined();
  });
});
