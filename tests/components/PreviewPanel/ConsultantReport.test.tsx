/**
 * ConsultantReport Component - Smoke Test
 */

import { describe, it, expect } from 'vitest';
import * as ConsultantReport from '../../../components/PreviewPanel/ConsultantReport';

describe('ConsultantReport', () => {
  it('should export ConsultantReport component', () => {
    expect(ConsultantReport).toBeDefined();
  });
});
