/**
 * MegaSettingsModal - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as MegaSettingsModal from '../../../components/MegaSettingsModal/index';

describe('MegaSettingsModal Index', () => {
  it('should export MegaSettingsModal', () => {
    expect(MegaSettingsModal).toBeDefined();
  });
});
