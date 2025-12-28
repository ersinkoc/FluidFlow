/**
 * ExpandedPromptModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ExpandedPromptModal from '../../../components/ControlPanel/ExpandedPromptModal';

describe('ExpandedPromptModal', () => {
  it('should export ExpandedPromptModal component', () => {
    expect(ExpandedPromptModal).toBeDefined();
  });
});
