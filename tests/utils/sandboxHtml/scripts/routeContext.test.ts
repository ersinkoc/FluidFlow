/**
 * Route Context - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as routeContext from '../../../../utils/sandboxHtml/scripts/routeContext';

describe('Route Context', () => {
  it('should export route context functions', () => {
    expect(routeContext).toBeDefined();
  });
});
