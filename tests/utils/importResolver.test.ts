/**
 * Import Resolver - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as importResolver from '../../utils/importResolver';

describe('importResolver', () => {
  it('should export import resolver functions', () => {
    expect(importResolver).toBeDefined();
  });
});
