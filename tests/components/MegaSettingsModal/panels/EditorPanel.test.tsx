/**
 * EditorPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as EditorPanel from '../../../../components/MegaSettingsModal/panels/EditorPanel';

describe('EditorPanel', () => {
  it('should export EditorPanel component', () => {
    expect(EditorPanel).toBeDefined();
  });
});
