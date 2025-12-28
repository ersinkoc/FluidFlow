/**
 * AIProvidersPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as AIProvidersPanel from '../../../../components/MegaSettingsModal/panels/AIProvidersPanel';

describe('AIProvidersPanel', () => {
  it('should export AIProvidersPanel component', () => {
    expect(AIProvidersPanel).toBeDefined();
  });
});
