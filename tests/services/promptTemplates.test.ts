/**
 * Prompt Templates Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as promptTemplates from '../../services/promptTemplates';

describe('Prompt Templates', () => {
  it('should export prompt template functions', () => {
    expect(promptTemplates).toBeDefined();
  });
});
