/**
 * QuickStylesTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as QuickStylesTab from '../../../../components/PreviewPanel/InspectorPanel/QuickStylesTab';

describe('QuickStylesTab', () => {
  it('should export QuickStylesTab component', () => {
    expect(QuickStylesTab).toBeDefined();
  });
});
