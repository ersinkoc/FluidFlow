/**
 * ContextMenu - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ContextMenu from '../../../components/ContextMenu/index';

describe('ContextMenu Index', () => {
  it('should export ContextMenu', () => {
    expect(ContextMenu).toBeDefined();
  });
});
