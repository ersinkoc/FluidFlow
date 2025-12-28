/**
 * Version Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as version from '../../services/version';

describe('Version Service', () => {
  it('should export version information', () => {
    expect(version).toBeDefined();
  });
});
