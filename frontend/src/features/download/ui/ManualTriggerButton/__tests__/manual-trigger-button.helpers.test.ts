import { describe, expect, it } from 'vitest';
import { toManualTriggerFailure } from '../manual-trigger-button.helpers';

describe('toManualTriggerFailure', () => {
  it('maps the scheduler concurrent-run-guard message to "already-in-progress"', () => {
    expect(toManualTriggerFailure('schedule: a download run is already in progress')).toEqual({
      status: 'already-in-progress',
    });
  });

  it('maps any other refusal to an error result carrying the message', () => {
    expect(toManualTriggerFailure('downloads is starting')).toEqual({
      status: 'error',
      errorMessage: 'downloads is starting',
    });
  });
});
