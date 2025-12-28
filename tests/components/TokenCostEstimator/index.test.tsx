/**
 * TokenCostEstimator - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as TokenCostEstimator from '../../../components/TokenCostEstimator/index';

describe('TokenCostEstimator Index', () => {
  it('should export TokenCostEstimator', () => {
    expect(TokenCostEstimator).toBeDefined();
  });
});
