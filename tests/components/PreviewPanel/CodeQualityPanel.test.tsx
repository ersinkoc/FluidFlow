/**
 * CodeQualityPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as CodeQualityPanel from '../../../components/PreviewPanel/CodeQualityPanel';

describe('CodeQualityPanel', () => {
  it('should export CodeQualityPanel component', () => {
    expect(CodeQualityPanel).toBeDefined();
  });
});
