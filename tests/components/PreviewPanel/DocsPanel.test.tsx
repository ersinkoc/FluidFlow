/**
 * DocsPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as DocsPanel from '../../../components/PreviewPanel/DocsPanel';

describe('DocsPanel', () => {
  it('should export DocsPanel component', () => {
    expect(DocsPanel).toBeDefined();
  });
});
