/**
 * Server Runner API - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as runnerApi from '../../../server/api/runner';

describe('Server Runner API', () => {
  it('should export Runner API endpoints', () => {
    expect(runnerApi).toBeDefined();
  });
});
