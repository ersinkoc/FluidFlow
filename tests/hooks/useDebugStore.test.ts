/**
 * useDebugStore Hook Tests
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebugStore } from '../../hooks/useDebugStore';

describe('useDebugStore', () => {
  it('should provide debug store', () => {
    const { result } = renderHook(() => useDebugStore());
    expect(result.current).toBeDefined();
  });
});
