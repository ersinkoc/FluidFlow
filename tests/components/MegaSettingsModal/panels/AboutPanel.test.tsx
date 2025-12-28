/**
 * AboutPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AboutPanel from '../../../../components/MegaSettingsModal/panels/AboutPanel';

describe('AboutPanel', () => {
  it('should export AboutPanel component', () => {
    expect(AboutPanel).toBeDefined();
  });
});
