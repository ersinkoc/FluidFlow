/**
 * Environment Variables - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as envVariables from '../../../../utils/sandboxHtml/scripts/envVariables';

describe('Environment Variables', () => {
  it('should export environment variable functions', () => {
    expect(envVariables).toBeDefined();
  });
});
