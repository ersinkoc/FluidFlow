/**
 * ActivityBar Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ActivityBar from '../../../components/IDEFrame/ActivityBar';

describe('ActivityBar', () => {
  it('should export ActivityBar component', () => {
    expect(ActivityBar).toBeDefined();
  });
});
