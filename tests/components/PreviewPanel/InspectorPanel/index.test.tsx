/**
 * InspectorPanel - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as InspectorPanel from '../../../../components/PreviewPanel/InspectorPanel/index';

describe('InspectorPanel Index', () => {
  it('should export InspectorPanel', () => {
    expect(InspectorPanel).toBeDefined();
  });
});
