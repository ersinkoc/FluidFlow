/**
 * ProjectTemplateSelector Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProjectTemplateSelector from '../../../components/ControlPanel/ProjectTemplateSelector';

describe('ProjectTemplateSelector', () => {
  it('should export ProjectTemplateSelector component', () => {
    expect(ProjectTemplateSelector).toBeDefined();
  });
});
