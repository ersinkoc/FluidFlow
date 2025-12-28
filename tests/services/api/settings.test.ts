/**
 * Settings API Service - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as settingsApi from '../../../services/api/settings';

describe('Settings API Service', () => {
  it('should export settings API functions', () => {
    expect(settingsApi).toBeDefined();
  });
});
