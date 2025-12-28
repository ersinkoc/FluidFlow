/**
 * SettingsSection Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsSection from '../../../../components/MegaSettingsModal/shared/SettingsSection';

describe('SettingsSection', () => {
  it('should export SettingsSection component', () => {
    expect(SettingsSection).toBeDefined();
  });
});
