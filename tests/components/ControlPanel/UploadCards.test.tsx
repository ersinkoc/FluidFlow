/**
 * UploadCards Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as UploadCards from '../../../components/ControlPanel/UploadCards';

describe('UploadCards', () => {
  it('should export UploadCards component', () => {
    expect(UploadCards).toBeDefined();
  });
});
