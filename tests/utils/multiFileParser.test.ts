/**
 * Multi File Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as multiFileParser from '../../utils/multiFileParser';

describe('multiFileParser', () => {
  it('should export multi-file parser functions', () => {
    expect(multiFileParser).toBeDefined();
  });
});
