/**
 * Generate Project Context Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as generateProjectContext from '../../utils/generateProjectContext';

describe('Generate Project Context', () => {
  it('should export project context generation functions', () => {
    expect(generateProjectContext).toBeDefined();
  });
});
