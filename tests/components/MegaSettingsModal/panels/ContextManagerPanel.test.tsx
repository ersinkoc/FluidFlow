/**
 * ContextManagerPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ContextManagerPanel from '../../../../components/MegaSettingsModal/panels/ContextManagerPanel';

describe('ContextManagerPanel', () => {
  it('should export ContextManagerPanel component', () => {
    expect(ContextManagerPanel).toBeDefined();
  });
});
