/**
 * StatusBar Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as StatusBar from '../../components/StatusBar';

describe('StatusBar', () => {
  it('should export StatusBar component', () => {
    expect(StatusBar).toBeDefined();
  });
});
