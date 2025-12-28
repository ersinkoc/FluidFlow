/**
 * Server AI API - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as aiApi from '../../../server/api/ai';

describe('Server AI API', () => {
  it('should export AI API endpoints', () => {
    expect(aiApi).toBeDefined();
  });
});
