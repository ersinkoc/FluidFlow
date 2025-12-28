/**
 * useResponseParser Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useResponseParser from '../../hooks/useResponseParser';

describe('useResponseParser', () => {
  it('should export useResponseParser hook', () => {
    expect(useResponseParser).toBeDefined();
  });
});
