/**
 * TitleBar Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as TitleBar from '../../../components/IDEFrame/TitleBar';

describe('TitleBar', () => {
  it('should export TitleBar component', () => {
    expect(TitleBar).toBeDefined();
  });
});
