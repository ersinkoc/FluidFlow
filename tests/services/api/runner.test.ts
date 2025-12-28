/**
 * Runner API Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as runnerApi from '../../../services/api/runner';

describe('Runner API Service', () => {
  it('should export runner API functions', () => {
    expect(runnerApi).toBeDefined();
  });
});
