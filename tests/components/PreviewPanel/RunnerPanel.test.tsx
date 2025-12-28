/**
 * RunnerPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as RunnerPanel from '../../../components/PreviewPanel/RunnerPanel';

describe('RunnerPanel', () => {
  it('should export RunnerPanel component', () => {
    expect(RunnerPanel).toBeDefined();
  });
});
