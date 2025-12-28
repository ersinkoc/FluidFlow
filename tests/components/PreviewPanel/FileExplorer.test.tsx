/**
 * FileExplorer Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as FileExplorer from '../../../components/PreviewPanel/FileExplorer';

describe('FileExplorer', () => {
  it('should export FileExplorer component', () => {
    expect(FileExplorer).toBeDefined();
  });
});
