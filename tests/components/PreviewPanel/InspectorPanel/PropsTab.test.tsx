/**
 * PropsTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PropsTab from '../../../../components/PreviewPanel/InspectorPanel/PropsTab';

describe('PropsTab', () => {
  it('should export PropsTab component', () => {
    expect(PropsTab).toBeDefined();
  });
});
