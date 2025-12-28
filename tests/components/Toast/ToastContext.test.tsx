/**
 * ToastContext Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ToastContext from '../../../components/Toast/ToastContext';

describe('ToastContext', () => {
  it('should export ToastContext', () => {
    expect(ToastContext).toBeDefined();
  });
});
