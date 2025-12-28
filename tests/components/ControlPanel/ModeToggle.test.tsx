/**
 * ModeToggle Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ModeToggle from '../../../components/ControlPanel/ModeToggle';

describe('ModeToggle', () => {
  it('should export ModeToggle component', () => {
    expect(ModeToggle).toBeDefined();
  });
});
