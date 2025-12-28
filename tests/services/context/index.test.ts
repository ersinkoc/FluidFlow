/**
 * Context Services - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as context from '../../../services/context/index';

describe('Context Services Index', () => {
  it('should export context services', () => {
    expect(context).toBeDefined();
  });
});
