/**
 * WebContainer Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as webcontainer from '../../services/webcontainer';

describe('WebContainer', () => {
  it('should export webcontainer functions', () => {
    expect(webcontainer).toBeDefined();
  });
});
