/**
 * GitPanel Component Tests - Smoke Tests
 */

import { describe, it, expect, vi } from 'vitest';
import GitPanel from '../../components/GitPanel';

vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({
    currentProject: null,
    gitStatus: null,
  }),
}));

describe('GitPanel', () => {
  it('should be defined', () => {
    expect(GitPanel).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof GitPanel).toBe('function');
  });
});
