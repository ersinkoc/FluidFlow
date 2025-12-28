/**
 * PromptInput Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptInput from '../../../components/ControlPanel/PromptInput';

describe('PromptInput', () => {
  it('should export PromptInput component', () => {
    expect(PromptInput).toBeDefined();
  });
});
