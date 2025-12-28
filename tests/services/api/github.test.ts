/**
 * GitHub API Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as githubApi from '../../../services/api/github';

describe('GitHub API Service', () => {
  it('should export GitHub API functions', () => {
    expect(githubApi).toBeDefined();
  });
});
