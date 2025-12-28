/**
 * Parser Patterns - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as patterns from '../../../utils/parser/patterns';

describe('Parser Patterns', () => {
  it('should export parser patterns', () => {
    expect(patterns).toBeDefined();
  });
});
