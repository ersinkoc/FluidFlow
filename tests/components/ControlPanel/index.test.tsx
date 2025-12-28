/**
 * ControlPanel - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ControlPanel from '../../../components/ControlPanel/index';

describe('ControlPanel Index', () => {
  it('should export ControlPanel', () => {
    expect(ControlPanel).toBeDefined();
  });
});
