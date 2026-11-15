import type { ManualTriggerResult } from './manual-trigger-button.types';
import { MANUAL_TRIGGER_ALREADY_IN_PROGRESS_MESSAGE } from './manual-trigger-button.constants';

/**
 * Maps a refused `TriggerDownloadCheck` to a typed result: the scheduler's
 * concurrent-run-guard message is `"already-in-progress"`; any other refusal is
 * a generic error carrying the backend's message verbatim.
 *
 * @param message The refusal's message.
 * @returns The typed result.
 */
export function toManualTriggerFailure(message: string): ManualTriggerResult {
  if (message === MANUAL_TRIGGER_ALREADY_IN_PROGRESS_MESSAGE) {
    return { status: 'already-in-progress' };
  }

  return { status: 'error', errorMessage: message };
}
