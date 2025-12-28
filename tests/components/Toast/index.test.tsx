/**
 * Toast - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as Toast from '../../../components/Toast/index';

describe('Toast Index', () => {
  it('should export Toast module', () => {
    expect(Toast).toBeDefined();
  });
});
