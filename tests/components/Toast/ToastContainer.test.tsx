/**
 * ToastContainer Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ToastContainer from '../../../components/Toast/ToastContainer';

describe('ToastContainer', () => {
  it('should export ToastContainer component', () => {
    expect(ToastContainer).toBeDefined();
  });
});
