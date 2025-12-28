/**
 * CodeEditor Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { CodeEditor } from '../../../components/PreviewPanel/CodeEditor';

describe('CodeEditor', () => {
  it('should be defined', () => {
    expect(CodeEditor).toBeDefined();
  });
});
