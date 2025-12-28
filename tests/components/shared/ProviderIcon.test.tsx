/**
 * ProviderIcon Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProviderIcon from '../../../components/shared/ProviderIcon';

describe('ProviderIcon', () => {
  it('should export ProviderIcon component', () => {
    expect(ProviderIcon).toBeDefined();
  });
});
