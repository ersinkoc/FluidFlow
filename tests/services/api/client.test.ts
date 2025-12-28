/**
 * API Client - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as client from '../../../services/api/client';

describe('API Client', () => {
  it('should export API client functions', () => {
    expect(client).toBeDefined();
  });
});
