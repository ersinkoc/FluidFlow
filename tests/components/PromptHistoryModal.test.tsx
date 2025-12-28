/**
 * PromptHistoryModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptHistoryModal from '../../components/PromptHistoryModal';

describe('PromptHistoryModal', () => {
  it('should export PromptHistoryModal component', () => {
    expect(PromptHistoryModal).toBeDefined();
  });
});
