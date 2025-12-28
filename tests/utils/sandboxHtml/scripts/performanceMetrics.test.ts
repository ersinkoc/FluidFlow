/**
 * Performance Metrics - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as performanceMetrics from '../../../../utils/sandboxHtml/scripts/performanceMetrics';

describe('Performance Metrics', () => {
  it('should export performance metrics functions', () => {
    expect(performanceMetrics).toBeDefined();
  });
});
