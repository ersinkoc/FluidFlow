/**
 * ProjectManager Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import ProjectManager from '../../components/ProjectManager';

describe('ProjectManager', () => {
  it('should be defined', () => {
    expect(ProjectManager).toBeDefined();
  });
});
