import { HOURS_PER_DAY, MILLIS_PER_SECOND, MINUTES_PER_HOUR, SECONDS_PER_MINUTE } from './datetime.constants';

/**
 * Pads a number to a two-digit, zero-filled string for time/date formatting.
 */
function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats an ISO 8601 timestamp as a local-timezone `HH:MM:SS` string, using
 * the COMPUTER'S own timezone via `Date` local getters — never UTC and never a
 * hardcoded offset. The backend emits UTC (`...Z`) timestamps; this converts
 * them to whatever zone the machine is in. Returns the raw input unchanged when
 * it is not a parseable date.
 */
export function formatLocalTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`;
}

/**
 * Formats an ISO 8601 timestamp as a local-timezone `YYYY-MM-DD HH:MM:SS`
 * string, using the computer's own timezone (same rationale as
 * {@link formatLocalTime}). Returns the raw input unchanged when it is not a
 * parseable date.
 */
export function formatLocalDateTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())} ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`;
}

/**
 * Formats epoch millis as a short "how long ago" label — `just now`, `5m ago`,
 * `3h ago`, `2d ago`. This is the half of a timestamp that says whether an
 * event still matters: an absolute `YYYY-MM-DD HH:MM:SS` answers *when*, and
 * answering *how long ago* from it is work the reader should not have to do.
 *
 * `now` defaults to the current time and is overridable so callers and tests
 * stay deterministic, matching `formatHistoryRelativeRecency`'s own signature.
 * A timestamp ahead of `now` — a machine whose clock or timezone moved after
 * the record was written — collapses to `just now` rather than rendering a
 * negative age.
 */
export function formatRelativeTimeAgo(timestampMs: number, now: number = Date.now()): string {
  const elapsedSeconds = Math.floor((now - timestampMs) / MILLIS_PER_SECOND);

  if (elapsedSeconds < SECONDS_PER_MINUTE) {
    return 'just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);

  if (elapsedMinutes < MINUTES_PER_HOUR) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / MINUTES_PER_HOUR);

  if (elapsedHours < HOURS_PER_DAY) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / HOURS_PER_DAY)}d ago`;
}
