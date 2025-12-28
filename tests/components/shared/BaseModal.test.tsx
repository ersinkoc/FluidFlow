/**
 * BaseModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as BaseModal from '../../../components/shared/BaseModal';

describe('BaseModal', () => {
  it('should export BaseModal component', () => {
    expect(BaseModal).toBeDefined();
  });
});
