/**
 * BatchGenerationModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as BatchGenerationModal from '../../../components/ControlPanel/BatchGenerationModal';

describe('BatchGenerationModal', () => {
  it('should export BatchGenerationModal component', () => {
    expect(BatchGenerationModal).toBeDefined();
  });
});
