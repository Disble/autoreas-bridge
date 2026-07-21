import { describe, expect, it } from 'vitest';
import { hasSyncResult } from '../devices-workspace.helpers';

describe('hasSyncResult', () => {
  it('returns false for an empty sync result', () => {
    expect(hasSyncResult('')).toBe(false);
  });

  it('returns true for a non-empty sync result', () => {
    expect(hasSyncResult('done')).toBe(true);
  });
});
