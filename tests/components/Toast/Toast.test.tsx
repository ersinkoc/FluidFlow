/**
 * Toast Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as Toast from '../../../components/Toast/Toast';

describe('Toast', () => {
  it('should export Toast component', () => {
    expect(Toast).toBeDefined();
  });
});
