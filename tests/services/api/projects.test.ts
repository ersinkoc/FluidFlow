/**
 * Projects API Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as projectsApi from '../../../services/api/projects';

describe('Projects API Service', () => {
  it('should export projects API functions', () => {
    expect(projectsApi).toBeDefined();
  });
});
