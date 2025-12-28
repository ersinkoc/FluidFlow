/**
 * ProjectsPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProjectsPanel from '../../../../components/MegaSettingsModal/panels/ProjectsPanel';

describe('ProjectsPanel', () => {
  it('should export ProjectsPanel component', () => {
    expect(ProjectsPanel).toBeDefined();
  });
});
