/**
 * ErrorBoundary Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ErrorBoundary from '../../components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('should export ErrorBoundary component', () => {
    expect(ErrorBoundary).toBeDefined();
  });
});
