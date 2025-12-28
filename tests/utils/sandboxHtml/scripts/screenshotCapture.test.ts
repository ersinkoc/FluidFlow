/**
 * Screenshot Capture - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as screenshotCapture from '../../../../utils/sandboxHtml/scripts/screenshotCapture';

describe('Screenshot Capture', () => {
  it('should export screenshot capture functions', () => {
    expect(screenshotCapture).toBeDefined();
  });
});
