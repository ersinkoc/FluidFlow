/**
 * Project Templates Constants - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as projectTemplates from '../../constants/projectTemplates';

describe('Project Templates Constants', () => {
  it('should export project templates constants', () => {
    expect(projectTemplates).toBeDefined();
  });
});
