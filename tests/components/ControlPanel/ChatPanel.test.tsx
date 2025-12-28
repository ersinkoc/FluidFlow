/**
 * ChatPanel Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { ChatPanel } from '../../../components/ControlPanel/ChatPanel';

describe('ChatPanel', () => {
  it('should be defined', () => {
    expect(ChatPanel).toBeDefined();
  });
});
