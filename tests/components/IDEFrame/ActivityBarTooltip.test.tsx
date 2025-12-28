/**
 * ActivityBarTooltip Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ActivityBarTooltip from '../../../components/IDEFrame/ActivityBarTooltip';

describe('ActivityBarTooltip', () => {
  it('should export ActivityBarTooltip component', () => {
    expect(ActivityBarTooltip).toBeDefined();
  });
});
