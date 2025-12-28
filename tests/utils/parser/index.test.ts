/**
 * Parser Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as parser from '../../../utils/parser/index';

describe('Parser Index', () => {
  it('should export parser utilities', () => {
    expect(parser).toBeDefined();
  });
});
