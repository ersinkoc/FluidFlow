/**
 * MarkdownPreview Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as MarkdownPreview from '../../../components/PreviewPanel/MarkdownPreview';

describe('MarkdownPreview', () => {
  it('should export MarkdownPreview component', () => {
    expect(MarkdownPreview).toBeDefined();
  });
});
