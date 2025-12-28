/**
 * DevToolsPanel - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as DevToolsPanel from '../../../../components/PreviewPanel/DevToolsPanel/index';

describe('DevToolsPanel Index', () => {
  it('should export DevToolsPanel', () => {
    expect(DevToolsPanel).toBeDefined();
  });
});
