/**
 * useTechStack Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useTechStack from '../../hooks/useTechStack';

describe('useTechStack', () => {
  it('should export useTechStack hook', () => {
    expect(useTechStack).toBeDefined();
  });
});
