/**
 * MegaSettings DebugPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as DebugPanel from '../../../../components/MegaSettingsModal/panels/DebugPanel';

describe('MegaSettings DebugPanel', () => {
  it('should export DebugPanel component', () => {
    expect(DebugPanel).toBeDefined();
  });
});
