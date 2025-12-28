/**
 * Git API - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as gitApi from '../../../services/api/git';

describe('Git API', () => {
  it('should export Git API functions', () => {
    expect(gitApi).toBeDefined();
  });
});
