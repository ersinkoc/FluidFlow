/**
 * Clipboard Mock Script - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as clipboardMock from '../../../../utils/sandboxHtml/scripts/clipboardMock';

describe('Clipboard Mock Script', () => {
  it('should export clipboard mock utilities', () => {
    expect(clipboardMock).toBeDefined();
  });
});
