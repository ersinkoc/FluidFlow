/**
 * FileItem Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as FileItem from '../../../components/GitPanel/FileItem';

describe('FileItem', () => {
  it('should export FileItem component', () => {
    expect(FileItem).toBeDefined();
  });
});
