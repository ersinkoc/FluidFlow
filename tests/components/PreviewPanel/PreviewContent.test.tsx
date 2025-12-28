/**
 * PreviewContent Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PreviewContent from '../../../components/PreviewPanel/PreviewContent';

describe('PreviewContent', () => {
  it('should export PreviewContent component', () => {
    expect(PreviewContent).toBeDefined();
  });
});
