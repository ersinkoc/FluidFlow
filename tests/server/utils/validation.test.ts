/**
 * Server Validation Utils - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as validation from '../../../server/utils/validation';

describe('server/utils/validation', () => {
  it('should export validation functions', () => {
    expect(validation).toBeDefined();
  });
});
