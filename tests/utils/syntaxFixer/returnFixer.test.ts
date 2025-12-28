/**
 * Return Fixer Syntax Fixer - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as returnFixer from '../../../utils/syntaxFixer/returnFixer';

describe('Return Fixer', () => {
  it('should export return fixing functions', () => {
    expect(returnFixer).toBeDefined();
  });
});
