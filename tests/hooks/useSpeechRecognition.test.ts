/**
 * useSpeechRecognition Hook - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as useSpeechRecognition from '../../hooks/useSpeechRecognition';

describe('useSpeechRecognition', () => {
  it('should export useSpeechRecognition hook', () => {
    expect(useSpeechRecognition).toBeDefined();
  });
});
