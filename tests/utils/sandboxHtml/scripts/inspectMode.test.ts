/**
 * Inspect Mode - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as inspectMode from '../../../../utils/sandboxHtml/scripts/inspectMode';

describe('Inspect Mode', () => {
  it('should export inspect mode functions', () => {
    expect(inspectMode).toBeDefined();
  });
});
