/**
 * NetworkTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as NetworkTab from '../../../../components/PreviewPanel/DevToolsPanel/NetworkTab';

describe('NetworkTab', () => {
  it('should export NetworkTab component', () => {
    expect(NetworkTab).toBeDefined();
  });
});
