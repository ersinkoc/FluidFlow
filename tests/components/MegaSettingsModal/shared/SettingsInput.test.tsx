/**
 * SettingsInput Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsInput from '../../../../components/MegaSettingsModal/shared/SettingsInput';

describe('SettingsInput', () => {
  it('should export SettingsInput component', () => {
    expect(SettingsInput).toBeDefined();
  });
});
