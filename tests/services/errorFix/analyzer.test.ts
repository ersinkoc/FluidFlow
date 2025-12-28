/**
 * Error Analyzer - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as analyzer from '../../../services/errorFix/analyzer';

describe('Error Analyzer', () => {
  it('should export error analyzer', () => {
    expect(analyzer).toBeDefined();
  });
});
