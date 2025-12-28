/**
 * GitPanel DiffModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as DiffModal from '../../../components/GitPanel/DiffModal';

describe('GitPanel DiffModal', () => {
  it('should export DiffModal component', () => {
    expect(DiffModal).toBeDefined();
  });
});
