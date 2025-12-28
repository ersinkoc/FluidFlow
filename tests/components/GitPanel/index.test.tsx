/**
 * GitPanel - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as GitPanel from '../../../components/GitPanel/index';

describe('GitPanel Index', () => {
  it('should export GitPanel', () => {
    expect(GitPanel).toBeDefined();
  });
});
