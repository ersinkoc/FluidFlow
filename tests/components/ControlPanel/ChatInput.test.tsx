/**
 * ChatInput Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { ChatInput } from '../../../components/ControlPanel/ChatInput';

describe('ChatInput', () => {
  it('should be defined', () => {
    expect(ChatInput).toBeDefined();
  });
});
