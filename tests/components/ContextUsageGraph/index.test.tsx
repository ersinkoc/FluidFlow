/**
 * ContextUsageGraph - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ContextUsageGraph from '../../../components/ContextUsageGraph/index';

describe('ContextUsageGraph Index', () => {
  it('should export ContextUsageGraph', () => {
    expect(ContextUsageGraph).toBeDefined();
  });
});
