/**
 * AppearancePanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AppearancePanel from '../../../../components/MegaSettingsModal/panels/AppearancePanel';

describe('AppearancePanel', () => {
  it('should export AppearancePanel component', () => {
    expect(AppearancePanel).toBeDefined();
  });
});
