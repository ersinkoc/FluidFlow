/**
 * SettingsPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SettingsPanel from '../../../components/ControlPanel/SettingsPanel';

describe('SettingsPanel', () => {
  it('should export SettingsPanel component', () => {
    expect(SettingsPanel).toBeDefined();
  });
});
