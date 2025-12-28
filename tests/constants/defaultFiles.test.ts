/**
 * Default Files Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as defaultFiles from '../../constants/defaultFiles';

describe('Default Files Constants', () => {
  it('should export default files constants', () => {
    expect(defaultFiles).toBeDefined();
  });
});
