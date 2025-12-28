/**
 * ErrorFixPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ErrorFixPanel from '../../../components/PreviewPanel/ErrorFixPanel';

describe('ErrorFixPanel', () => {
  it('should export ErrorFixPanel component', () => {
    expect(ErrorFixPanel).toBeDefined();
  });
});
