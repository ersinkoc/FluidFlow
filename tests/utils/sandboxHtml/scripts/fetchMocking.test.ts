/**
 * Fetch Mocking - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as fetchMocking from '../../../../utils/sandboxHtml/scripts/fetchMocking';

describe('Fetch Mocking', () => {
  it('should export fetch mocking functions', () => {
    expect(fetchMocking).toBeDefined();
  });
});
