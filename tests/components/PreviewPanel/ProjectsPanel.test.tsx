/**
 * ProjectsPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProjectsPanel from '../../../components/PreviewPanel/ProjectsPanel';

describe('ProjectsPanel', () => {
  it('should export ProjectsPanel component', () => {
    expect(ProjectsPanel).toBeDefined();
  });
});
