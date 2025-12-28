/**
 * PromptConfirmationModal Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as PromptConfirmationModal from '../../components/PromptConfirmationModal';

describe('PromptConfirmationModal', () => {
  it('should export PromptConfirmationModal component', () => {
    expect(PromptConfirmationModal).toBeDefined();
  });
});
