/**
 * TechStackModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as TechStackModal from '../../../components/ControlPanel/TechStackModal';

describe('TechStackModal', () => {
  it('should export TechStackModal component', () => {
    expect(TechStackModal).toBeDefined();
  });
});
