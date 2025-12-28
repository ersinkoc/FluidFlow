/**
 * TechStackPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as TechStackPanel from '../../../../components/MegaSettingsModal/panels/TechStackPanel';

describe('TechStackPanel', () => {
  it('should export TechStackPanel component', () => {
    expect(TechStackPanel).toBeDefined();
  });
});
