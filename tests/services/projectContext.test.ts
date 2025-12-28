/**
 * Project Context Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as projectContext from '../../services/projectContext';

describe('Project Context', () => {
  it('should export project context functions', () => {
    expect(projectContext).toBeDefined();
  });
});
