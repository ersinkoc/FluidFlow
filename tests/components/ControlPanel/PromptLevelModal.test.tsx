/**
 * PromptLevelModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptLevelModal from '../../../components/ControlPanel/PromptLevelModal';

describe('PromptLevelModal', () => {
  it('should export PromptLevelModal component', () => {
    expect(PromptLevelModal).toBeDefined();
  });
});
