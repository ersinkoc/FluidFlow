/**
 * Debug Logger - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as debugLogger from '../../../services/errorFix/debugLogger';

describe('Debug Logger', () => {
  it('should export debug logger', () => {
    expect(debugLogger).toBeDefined();
  });
});
