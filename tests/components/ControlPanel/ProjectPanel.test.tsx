/**
 * ProjectPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ProjectPanel from '../../../components/ControlPanel/ProjectPanel';

describe('ProjectPanel', () => {
  it('should export ProjectPanel component', () => {
    expect(ProjectPanel).toBeDefined();
  });
});
