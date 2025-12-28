/**
 * API Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as apiIndex from '../../../services/api/index';

describe('API Index', () => {
  it('should export API functions', () => {
    expect(apiIndex).toBeDefined();
  });
});
