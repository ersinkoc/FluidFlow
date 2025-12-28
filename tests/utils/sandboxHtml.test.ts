/**
 * Sandbox HTML Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as sandboxHtml from '../../utils/sandboxHtml';

describe('sandboxHtml', () => {
  it('should export sandbox HTML functions', () => {
    expect(sandboxHtml).toBeDefined();
  });
});
