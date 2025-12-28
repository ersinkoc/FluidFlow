/**
 * Sandbox Hooks - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as sandboxHooks from '../../../../utils/sandboxHtml/scripts/sandboxHooks';

describe('Sandbox Hooks', () => {
  it('should export sandbox hook functions', () => {
    expect(sandboxHooks).toBeDefined();
  });
});
