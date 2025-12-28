/**
 * MultiDevicePreview Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as MultiDevicePreview from '../../../components/PreviewPanel/MultiDevicePreview';

describe('MultiDevicePreview', () => {
  it('should export MultiDevicePreview component', () => {
    expect(MultiDevicePreview).toBeDefined();
  });
});
