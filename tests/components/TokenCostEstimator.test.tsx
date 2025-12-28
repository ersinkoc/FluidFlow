/**
 * TokenCostEstimator Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as TokenCostEstimator from '../../components/TokenCostEstimator';

describe('TokenCostEstimator', () => {
  it('should export TokenCostEstimator component', () => {
    expect(TokenCostEstimator).toBeDefined();
  });
});
