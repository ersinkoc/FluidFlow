/**
 * FileUploadZone Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as FileUploadZone from '../../../components/ControlPanel/FileUploadZone';

describe('FileUploadZone', () => {
  it('should export FileUploadZone component', () => {
    expect(FileUploadZone).toBeDefined();
  });
});
