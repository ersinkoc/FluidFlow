/**
 * ConsoleTab Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ConsoleTab from '../../../../components/PreviewPanel/DevToolsPanel/ConsoleTab';

describe('ConsoleTab', () => {
  it('should export ConsoleTab component', () => {
    expect(ConsoleTab).toBeDefined();
  });
});
