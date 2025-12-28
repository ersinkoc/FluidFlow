/**
 * StylesTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as StylesTab from '../../../../components/PreviewPanel/InspectorPanel/StylesTab';

describe('StylesTab', () => {
  it('should export StylesTab component', () => {
    expect(StylesTab).toBeDefined();
  });
});
