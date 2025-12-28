/**
 * UI Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ui from '../../constants/ui';

describe('UI Constants', () => {
  it('should export UI constants', () => {
    expect(ui).toBeDefined();
  });
});
