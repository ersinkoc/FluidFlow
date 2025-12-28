/**
 * CodeMapTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as CodeMapTab from '../../../components/PreviewPanel/CodeMapTab';

describe('CodeMapTab', () => {
  it('should export CodeMapTab component', () => {
    expect(CodeMapTab).toBeDefined();
  });
});
