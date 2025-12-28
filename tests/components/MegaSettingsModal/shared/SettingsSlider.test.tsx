/**
 * SettingsSlider Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsSlider from '../../../../components/MegaSettingsModal/shared/SettingsSlider';

describe('SettingsSlider', () => {
  it('should export SettingsSlider component', () => {
    expect(SettingsSlider).toBeDefined();
  });
});
