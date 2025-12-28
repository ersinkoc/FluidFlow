/**
 * Storage Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as storage from '../../constants/storage';

describe('Storage Constants', () => {
  it('should export storage constants', () => {
    expect(storage).toBeDefined();
  });
});
