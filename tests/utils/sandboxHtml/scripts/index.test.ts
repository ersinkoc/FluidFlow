/**
 * Sandbox HTML Scripts Index - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as sandboxScripts from '../../../../utils/sandboxHtml/scripts/index';

describe('Sandbox HTML Scripts', () => {
  it('should export sandbox script functions', () => {
    expect(sandboxScripts).toBeDefined();
  });
});
