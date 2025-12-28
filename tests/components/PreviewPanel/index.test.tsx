/**
 * PreviewPanel - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PreviewPanel from '../../../components/PreviewPanel/index';

describe('PreviewPanel Index', () => {
  it('should export PreviewPanel', () => {
    expect(PreviewPanel).toBeDefined();
  });
});
