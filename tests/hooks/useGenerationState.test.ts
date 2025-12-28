/**
 * useGenerationState Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGenerationState } from '../../hooks/useGenerationState';

describe('useGenerationState', () => {
  it('should be defined', () => {
    expect(useGenerationState).toBeDefined();
  });

  it('should return state object', () => {
    const { result } = renderHook(() => useGenerationState());
    expect(result.current).toBeDefined();
  });
});
