import { describe, expect, it } from 'vitest';
import { getSQLiteStatusTone, toSyncStatusChipState } from '../sync-status-chip.helpers';

describe('getSQLiteStatusTone', () => {
  it('returns success for healthy statuses', () => {
    expect(getSQLiteStatusTone('open')).toBe('success');
  });

  it('returns danger for unhealthy statuses', () => {
    expect(getSQLiteStatusTone('database unavailable')).toBe('danger');
  });
});

describe('toSyncStatusChipState', () => {
  it('shows nothing while the status loads', () => {
    expect(toSyncStatusChipState({ kind: 'loading' })).toBeNull();
  });

  it('shows the status in its tone once read', () => {
    expect(toSyncStatusChipState({ kind: 'ready', data: 'ok', isRefreshing: false })).toEqual({ status: 'ok', statusTone: 'success' });
  });

  it('shows a failed read as its message in danger, even when the message mentions open', () => {
    expect(toSyncStatusChipState({ kind: 'failure', code: 'failed_precondition', message: 'bridge database failed to open' })).toEqual({
      status: 'bridge database failed to open',
      statusTone: 'danger',
    });
  });
});
