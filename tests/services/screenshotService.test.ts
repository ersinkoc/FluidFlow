/**
 * Screenshot Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as screenshotService from '../../services/screenshotService';

describe('Screenshot Service', () => {
  it('should export screenshot service functions', () => {
    expect(screenshotService).toBeDefined();
  });
});
