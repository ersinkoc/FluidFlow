/**
 * ActivityLogPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ActivityLogPanel from '../../../components/PreviewPanel/ActivityLogPanel';

describe('ActivityLogPanel', () => {
  it('should export ActivityLogPanel component', () => {
    expect(ActivityLogPanel).toBeDefined();
  });
});
