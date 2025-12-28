/**
 * EnvironmentPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as EnvironmentPanel from '../../../components/PreviewPanel/EnvironmentPanel';

describe('EnvironmentPanel', () => {
  it('should export EnvironmentPanel component', () => {
    expect(EnvironmentPanel).toBeDefined();
  });
});
