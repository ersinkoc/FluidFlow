/**
 * Client Encryption Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as clientEncryption from '../../utils/clientEncryption';

describe('Client Encryption', () => {
  it('should export encryption functions', () => {
    expect(clientEncryption).toBeDefined();
  });
});
