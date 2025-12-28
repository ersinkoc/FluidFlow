/**
 * CommitDetailsView Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as CommitDetailsView from '../../../components/GitPanel/CommitDetailsView';

describe('CommitDetailsView', () => {
  it('should export CommitDetailsView component', () => {
    expect(CommitDetailsView).toBeDefined();
  });
});
