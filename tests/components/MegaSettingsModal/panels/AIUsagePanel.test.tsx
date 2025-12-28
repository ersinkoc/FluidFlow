/**
 * AIUsagePanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AIUsagePanel from '../../../../components/MegaSettingsModal/panels/AIUsagePanel';

describe('AIUsagePanel', () => {
  it('should export AIUsagePanel component', () => {
    expect(AIUsagePanel).toBeDefined();
  });
});
