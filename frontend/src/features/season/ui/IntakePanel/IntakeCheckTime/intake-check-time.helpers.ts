import { Time } from '@internationalized/date';
import { toErrorMessage } from '../../../../../shared/helpers/error-message.helpers';
import { CHECK_TIME_EMPTY_MESSAGE, CHECK_TIME_PATTERN, CHECK_TIME_SAVE_FAILED_MESSAGE } from './intake-check-time.constants';
import type { CheckTimeDraft, CheckTimeSaveRequest } from './intake-check-time.types';

/**
 * Parses a stored HH:MM into the time field's value.
 * @param hhmm The stored time.
 * @returns The time value, or `null` when `hhmm` is not a zero-padded 24-hour HH:MM.
 */
export function toCheckTimeValue(hhmm: string): Time | null {
  const match = CHECK_TIME_PATTERN.exec(hhmm);
  if (match === null) {
    return null;
  }
  return new Time(Number(match[1]), Number(match[2]));
}

/**
 * Renders a time field value as the zero-padded HH:MM the backend accepts.
 * @param value The time field value.
 * @returns The HH:MM string.
 */
export function formatCheckTime(value: Pick<Time, 'hour' | 'minute'>): string {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

/**
 * Turns the field's value into the HH:MM to save, refusing an incomplete field
 * so no backend call is made for it.
 * @param value The time field value.
 * @returns The HH:MM to send, or the message explaining why nothing is sent.
 */
export function toCheckTimeSaveRequest(value: CheckTimeDraft): CheckTimeSaveRequest {
  if (value === null) {
    return { ok: false, message: CHECK_TIME_EMPTY_MESSAGE };
  }
  return { ok: true, time: formatCheckTime(value) };
}

/**
 * The danger toast text of a rejected save: the bridge's message, or the
 * generic failure when it carries none.
 * @param error What the save rejected with.
 * @returns The toast text.
 */
export function toCheckTimeSaveError(error: unknown): string {
  return toErrorMessage(error, CHECK_TIME_SAVE_FAILED_MESSAGE);
}
