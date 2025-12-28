/**
 * IDEFrame - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as IDEFrame from '../../../components/IDEFrame/index';

describe('IDEFrame', () => {
  it('should export IDEFrame component', () => {
    expect(IDEFrame).toBeDefined();
  });
});
