/**
 * SnippetLibraryModal - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SnippetLibraryModal from '../../../components/SnippetLibraryModal/index';

describe('SnippetLibraryModal Index', () => {
  it('should export SnippetLibraryModal', () => {
    expect(SnippetLibraryModal).toBeDefined();
  });
});
