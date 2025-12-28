/**
 * CompactionPreviewModal - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as CompactionPreviewModal from '../../../components/CompactionPreviewModal/index';

describe('CompactionPreviewModal Index', () => {
  it('should export CompactionPreviewModal', () => {
    expect(CompactionPreviewModal).toBeDefined();
  });
});
