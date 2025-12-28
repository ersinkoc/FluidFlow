/**
 * JSON Parser Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as jsonParser from '../../utils/jsonParser';

describe('JSON Parser', () => {
  it('should export JSON parsing functions', () => {
    expect(jsonParser).toBeDefined();
  });
});
