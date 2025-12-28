/**
 * Drag Drop Enhancement - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as dragDropEnhancement from '../../../../utils/sandboxHtml/scripts/dragDropEnhancement';

describe('Drag Drop Enhancement', () => {
  it('should export drag drop enhancement functions', () => {
    expect(dragDropEnhancement).toBeDefined();
  });
});
