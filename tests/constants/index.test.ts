/**
 * Constants Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as constants from '../../constants/index';

describe('Constants Index', () => {
  it('should export constants', () => {
    expect(constants).toBeDefined();
  });
});
