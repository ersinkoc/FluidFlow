/**
 * PromptTemplateSelector Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptTemplateSelector from '../../../components/ControlPanel/PromptTemplateSelector';

describe('PromptTemplateSelector', () => {
  it('should export PromptTemplateSelector component', () => {
    expect(PromptTemplateSelector).toBeDefined();
  });
});
