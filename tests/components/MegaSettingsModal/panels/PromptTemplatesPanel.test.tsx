/**
 * PromptTemplatesPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptTemplatesPanel from '../../../../components/MegaSettingsModal/panels/PromptTemplatesPanel';

describe('PromptTemplatesPanel', () => {
  it('should export PromptTemplatesPanel component', () => {
    expect(PromptTemplatesPanel).toBeDefined();
  });
});
