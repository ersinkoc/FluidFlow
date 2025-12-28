/**
 * Prompt History Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as promptHistory from '../../services/promptHistory';

describe('Prompt History', () => {
  it('should export prompt history functions', () => {
    expect(promptHistory).toBeDefined();
  });
});
