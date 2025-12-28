/**
 * Server GitHub API - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as githubApi from '../../../server/api/github';

describe('Server GitHub API', () => {
  it('should export GitHub API endpoints', () => {
    expect(githubApi).toBeDefined();
  });
});
