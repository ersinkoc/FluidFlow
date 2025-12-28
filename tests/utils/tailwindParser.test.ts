/**
 * Tailwind Parser - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as tailwindParser from '../../utils/tailwindParser';

describe('tailwindParser', () => {
  it('should export tailwind parser functions', () => {
    expect(tailwindParser).toBeDefined();
  });
});
