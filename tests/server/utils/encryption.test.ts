/**
 * Server Encryption Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as encryption from '../../../server/utils/encryption';

describe('server/utils/encryption', () => {
  it('should export encryption functions', () => {
    expect(encryption).toBeDefined();
  });
});
