/**
 * DBStudio Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import { DBStudio } from '../../../components/PreviewPanel/DBStudio';

describe('DBStudio', () => {
  it('should be defined', () => {
    expect(DBStudio).toBeDefined();
  });
});
