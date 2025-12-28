/**
 * SettingsSelect Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsSelect from '../../../../components/MegaSettingsModal/shared/SettingsSelect';

describe('SettingsSelect', () => {
  it('should export SettingsSelect component', () => {
    expect(SettingsSelect).toBeDefined();
  });
});
