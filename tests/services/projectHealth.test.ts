/**
 * Project Health Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as projectHealth from '../../services/projectHealth';

describe('Project Health', () => {
  it('should export project health functions', () => {
    expect(projectHealth).toBeDefined();
  });
});
