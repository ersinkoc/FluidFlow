/**
 * Prompt Template Storage Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as promptTemplateStorage from '../../services/promptTemplateStorage';

describe('Prompt Template Storage', () => {
  it('should export prompt template storage functions', () => {
    expect(promptTemplateStorage).toBeDefined();
  });
});
