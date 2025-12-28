/**
 * WebContainerPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as WebContainerPanel from '../../../components/PreviewPanel/WebContainerPanel';

describe('WebContainerPanel', () => {
  it('should export WebContainerPanel component', () => {
    expect(WebContainerPanel).toBeDefined();
  });
});
