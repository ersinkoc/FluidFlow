/**
 * Parser JSON Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as parserJsonParser from '../../../utils/parser/jsonParser';

describe('Parser JSON Parser', () => {
  it('should export JSON parser functions', () => {
    expect(parserJsonParser).toBeDefined();
  });
});
