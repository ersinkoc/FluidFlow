/**
 * ChatTimeline Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ChatTimeline from '../../../components/ControlPanel/ChatTimeline';

describe('ChatTimeline', () => {
  it('should export ChatTimeline component', () => {
    expect(ChatTimeline).toBeDefined();
  });
});
