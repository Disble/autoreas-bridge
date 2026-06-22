import { describe, expect, it } from 'vitest';
import { toManualTriggerResult } from '../manual-trigger-button.helpers';

describe('toManualTriggerResult', () => {
  it('maps "ok" to a success result', () => {
    expect(toManualTriggerResult('ok')).toEqual({ status: 'success' });
  });

  it('maps the scheduler concurrent-run-guard message to "already-in-progress"', () => {
    expect(toManualTriggerResult('schedule: a download run is already in progress')).toEqual({
      status: 'already-in-progress',
    });
  });

  it('maps any other non-"ok" response to an error result carrying the message', () => {
    expect(toManualTriggerResult('download scheduler unavailable')).toEqual({
      status: 'error',
      errorMessage: 'download scheduler unavailable',
    });
  });
});
