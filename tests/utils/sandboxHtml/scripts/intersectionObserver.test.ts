/**
 * Intersection Observer - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as intersectionObserver from '../../../../utils/sandboxHtml/scripts/intersectionObserver';

describe('Intersection Observer', () => {
  it('should export intersection observer functions', () => {
    expect(intersectionObserver).toBeDefined();
  });
});
