/**
 * ContextManagerModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ContextManagerModal from '../../../components/ContextIndicator/ContextManagerModal';

describe('ContextManagerModal', () => {
  it('should export ContextManagerModal component', () => {
    expect(ContextManagerModal).toBeDefined();
  });
});
