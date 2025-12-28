/**
 * GithubModal - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as GithubModal from '../../../components/PreviewPanel/GithubModal';

describe('PreviewPanel GithubModal', () => {
  it('should export GithubModal component', () => {
    expect(GithubModal).toBeDefined();
  });
});
