/**
 * PromptHistoryModal - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptHistoryModal from '../../../components/PromptHistoryModal/index';

describe('PromptHistoryModal Index', () => {
  it('should export PromptHistoryModal', () => {
    expect(PromptHistoryModal).toBeDefined();
  });
});
