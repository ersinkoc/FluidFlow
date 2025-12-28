/**
 * ElementsTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ElementsTab from '../../../../components/PreviewPanel/DevToolsPanel/ElementsTab';

describe('ElementsTab', () => {
  it('should export ElementsTab component', () => {
    expect(ElementsTab).toBeDefined();
  });
});
