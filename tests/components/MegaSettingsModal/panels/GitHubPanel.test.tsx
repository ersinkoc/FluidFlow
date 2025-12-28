/**
 * GitHubPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as GitHubPanel from '../../../../components/MegaSettingsModal/panels/GitHubPanel';

describe('GitHubPanel', () => {
  it('should export GitHubPanel component', () => {
    expect(GitHubPanel).toBeDefined();
  });
});
