/**
 * ProjectStructure Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProjectStructure from '../../../components/PreviewPanel/ProjectStructure';

describe('ProjectStructure', () => {
  it('should export ProjectStructure component', () => {
    expect(ProjectStructure).toBeDefined();
  });
});
