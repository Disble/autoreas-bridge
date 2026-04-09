import { describe, expect, it } from 'vitest';
import { hasSyncResult } from '../bridge-dashboard.helpers';

describe('hasSyncResult', () => {
  it('returns false for empty results', () => {
    expect(hasSyncResult('')).toBe(false);
  });

  it('returns true when a sync result exists', () => {
    expect(hasSyncResult('reconciled')).toBe(true);
  });
});
