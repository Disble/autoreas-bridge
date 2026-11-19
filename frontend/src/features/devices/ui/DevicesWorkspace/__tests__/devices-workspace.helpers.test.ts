import { describe, expect, it } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { hasSyncResult, toSyncResult } from '../devices-workspace.helpers';

describe('hasSyncResult', () => {
  it('returns false for an empty sync result', () => {
    expect(hasSyncResult('')).toBe(false);
  });

  it('returns true for a non-empty sync result', () => {
    expect(hasSyncResult('done')).toBe(true);
  });
});

describe('toSyncResult', () => {
  it('answers the feedback of each reconcile state', () => {
    const cases = [
      ['idle', { status: 'idle', error: null }, ''],
      ['pending', { status: 'pending', error: null }, ''],
      ['success', { status: 'success', error: null }, 'ok'],
      ['error', { status: 'error', error: createBridgeError('unavailable', 'sync is starting') }, 'sync is starting'],
    ] as const;

    for (const [caseName, mutation, expected] of cases) {
      expect.soft(toSyncResult(mutation), caseName).toBe(expected);
    }
  });
});
