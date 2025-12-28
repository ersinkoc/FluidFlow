/**
 * CommitFileIcon Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as CommitFileIcon from '../../../components/GitPanel/CommitFileIcon';

describe('CommitFileIcon', () => {
  it('should export CommitFileIcon component', () => {
    expect(CommitFileIcon).toBeDefined();
  });
});
