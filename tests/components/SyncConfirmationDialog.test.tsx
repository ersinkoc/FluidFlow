/**
 * SyncConfirmationDialog Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as SyncConfirmationDialog from '../../components/SyncConfirmationDialog';

describe('SyncConfirmationDialog', () => {
  it('should export SyncConfirmationDialog component', () => {
    expect(SyncConfirmationDialog).toBeDefined();
  });
});
