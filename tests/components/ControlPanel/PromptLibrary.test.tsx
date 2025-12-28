/**
 * PromptLibrary Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptLibrary from '../../../components/ControlPanel/PromptLibrary';

describe('PromptLibrary', () => {
  it('should export PromptLibrary component', () => {
    expect(PromptLibrary).toBeDefined();
  });
});
