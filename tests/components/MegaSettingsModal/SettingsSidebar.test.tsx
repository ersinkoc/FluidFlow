/**
 * SettingsSidebar Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsSidebar from '../../../components/MegaSettingsModal/SettingsSidebar';

describe('SettingsSidebar', () => {
  it('should export SettingsSidebar component', () => {
    expect(SettingsSidebar).toBeDefined();
  });
});
