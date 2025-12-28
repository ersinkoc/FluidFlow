/**
 * BoxModelTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as BoxModelTab from '../../../../components/PreviewPanel/InspectorPanel/BoxModelTab';

describe('BoxModelTab', () => {
  it('should export BoxModelTab component', () => {
    expect(BoxModelTab).toBeDefined();
  });
});
