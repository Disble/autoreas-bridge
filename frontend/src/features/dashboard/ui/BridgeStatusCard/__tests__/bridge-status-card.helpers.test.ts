import { describe, expect, it } from 'vitest';
import { getSQLiteStatusTone, isSQLiteStatusLoading } from '../bridge-status-card.helpers';

describe('isSQLiteStatusLoading', () => {
  it('treats an empty status as loading', () => {
    expect(isSQLiteStatusLoading('')).toBe(true);
  });

  it('treats a populated status as loaded', () => {
    expect(isSQLiteStatusLoading('ok')).toBe(false);
  });
});

describe('getSQLiteStatusTone', () => {
  it('returns success for healthy statuses', () => {
    expect(getSQLiteStatusTone('open')).toBe('success');
  });

  it('returns danger for unhealthy statuses', () => {
    expect(getSQLiteStatusTone('database unavailable')).toBe('danger');
  });
});
