import { describe, expect, it } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { toAutoStartSaveFailure } from '../auto-start-panel.helpers';

describe('toAutoStartSaveFailure', () => {
  it('shows the message of a failed save only', () => {
    const error = createBridgeError('internal', 'registry unavailable');

    expect(toAutoStartSaveFailure({ status: 'error', error })).toBe('registry unavailable');
    expect(toAutoStartSaveFailure({ status: 'error', error: null })).toBe('');
    expect(toAutoStartSaveFailure({ status: 'pending', error })).toBe('');
    expect(toAutoStartSaveFailure({ status: 'success', error: null })).toBe('');
  });
});
