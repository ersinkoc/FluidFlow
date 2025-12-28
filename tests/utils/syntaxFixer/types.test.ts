/**
 * SyntaxFixer Types - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as types from '../../../utils/syntaxFixer/types';

describe('SyntaxFixer Types', () => {
  it('should export syntaxFixer types', () => {
    expect(types).toBeDefined();
  });
});
