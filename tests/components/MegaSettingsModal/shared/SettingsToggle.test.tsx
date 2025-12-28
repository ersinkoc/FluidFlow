/**
 * SettingsToggle Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsToggle from '../../../../components/MegaSettingsModal/shared/SettingsToggle';

describe('SettingsToggle', () => {
  it('should export SettingsToggle component', () => {
    expect(SettingsToggle).toBeDefined();
  });
});
