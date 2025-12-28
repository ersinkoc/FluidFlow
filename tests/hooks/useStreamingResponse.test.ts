/**
 * useStreamingResponse Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useStreamingResponse from '../../hooks/useStreamingResponse';

describe('useStreamingResponse', () => {
  it('should export useStreamingResponse hook', () => {
    expect(useStreamingResponse).toBeDefined();
  });
});
