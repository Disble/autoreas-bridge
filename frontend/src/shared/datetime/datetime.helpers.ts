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
