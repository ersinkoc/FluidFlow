/**
 * PromptEngineerModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptEngineerModal from '../../../components/ControlPanel/PromptEngineerModal';

describe('PromptEngineerModal', () => {
  it('should export PromptEngineerModal component', () => {
    expect(PromptEngineerModal).toBeDefined();
  });
});
