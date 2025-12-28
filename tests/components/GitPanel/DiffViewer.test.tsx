/**
 * DiffViewer Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as DiffViewer from '../../../components/GitPanel/DiffViewer';

describe('DiffViewer', () => {
  it('should export DiffViewer component', () => {
    expect(DiffViewer).toBeDefined();
  });
});
