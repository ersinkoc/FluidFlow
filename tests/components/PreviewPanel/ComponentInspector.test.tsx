/**
 * ComponentInspector Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { ComponentInspector } from '../../../components/PreviewPanel/ComponentInspector';

describe('ComponentInspector', () => {
  it('should be defined', () => {
    expect(ComponentInspector).toBeDefined();
  });
});
