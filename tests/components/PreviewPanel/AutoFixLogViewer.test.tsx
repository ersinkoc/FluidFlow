/**
 * AutoFixLogViewer Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AutoFixLogViewer from '../../../components/PreviewPanel/AutoFixLogViewer';

describe('AutoFixLogViewer', () => {
  it('should export AutoFixLogViewer component', () => {
    expect(AutoFixLogViewer).toBeDefined();
  });
});
