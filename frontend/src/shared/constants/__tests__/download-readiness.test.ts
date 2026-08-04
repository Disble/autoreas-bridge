import { describe, expect, it } from 'vitest';
import { getDownloadReadinessReasonLabel } from '../download-readiness';

describe('getDownloadReadinessReasonLabel', () => {
  it('maps every canonical blocker to its user-facing correction', () => {
    expect(getDownloadReadinessReasonLabel('missing_source')).toBe('Source page is missing.');
    expect(getDownloadReadinessReasonLabel('invalid_source')).toBe('Source page is invalid.');
    expect(getDownloadReadinessReasonLabel('unsupported_source')).toBe('This source is not supported for downloads.');
    expect(getDownloadReadinessReasonLabel('destination_unresolved')).toBe('Download destination could not be resolved.');
  });
});
