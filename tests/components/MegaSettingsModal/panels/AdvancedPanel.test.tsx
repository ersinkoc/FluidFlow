/**
 * AdvancedPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AdvancedPanel from '../../../../components/MegaSettingsModal/panels/AdvancedPanel';

describe('AdvancedPanel', () => {
  it('should export AdvancedPanel component', () => {
    expect(AdvancedPanel).toBeDefined();
  });
});
