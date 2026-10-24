import { ACTIVITY_RUN_MINUTE_MS, ACTIVITY_SECOND_MS } from './activity-run-story.constants';
import type { ActivityRead, ActivityTaggedRead } from './activity-run-story.types';

/** Zero-pads a clock part to the given width. */
function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Formats epoch milliseconds as the owner's local clock with milliseconds.
 *
 * @param ms Epoch milliseconds.
 * @returns `17:31:04.120`.
 */
export function formatActivityClock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Words whole minutes and leftover seconds, `2 min 5 s`, `2 min`. */
function formatMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/**
 * Formats a recorded duration at the precision it deserves.
 *
 * @param ms Duration in milliseconds.
 * @returns `41 ms`, `3.2 s` or `2 min 5 s`.
 */
export function formatActivityDuration(ms: number): string {
  if (ms < ACTIVITY_SECOND_MS) {
    return `${ms} ms`;
  }
  if (ms < ACTIVITY_RUN_MINUTE_MS) {
    return `${(ms / ACTIVITY_SECOND_MS).toFixed(1)} s`;
  }
  return formatMinutes(Math.round(ms / ACTIVITY_SECOND_MS));
}

/**
 * Formats a signed distance from the incident moment, as the window axis labels it.
 *
 * @param ms Milliseconds from the incident; negative is before it.
 * @returns `−2 min`, `+30 s` or `0 s`.
 */
export function formatActivityOffset(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / ACTIVITY_SECOND_MS);
  const magnitude = totalSeconds < 60 ? `${totalSeconds} s` : formatMinutes(totalSeconds);
  if (ms === 0) {
    return magnitude;
  }
  // Stryker disable next-line EqualityOperator: `ms <= 0` differs only at 0, which returned unsigned above.
  return `${ms < 0 ? '−' : '+'}${magnitude}`;
}

/**
 * Keys one read by what it reads and which attempt it is, so an answer to an
 * older request is told apart from the current one.
 *
 * @param id What the read reads.
 * @param attempt The "Try again" count.
 * @returns `<id>#<attempt>`.
 */
export function toActivityReadKey(id: string | number, attempt: number): string {
  return `${id}#${attempt}`;
}

/**
 * The read the current request shows: its tagged answer once it arrived,
 * loading while it is pending or while only an older answer is held.
 *
 * @param tagged The last answer, tagged with the request it answers.
 * @param key The current request's key.
 * @returns The current read.
 */
export function toActivityCurrentRead<T>(tagged: ActivityTaggedRead<T> | undefined, key: string): ActivityRead<T> {
  return tagged?.key === key ? tagged.read : { status: 'loading' };
}

/**
 * Reads a lookup that may find nothing: nothing is gone, anything else ready.
 *
 * @param value What the lookup found.
 * @returns The gone or ready read.
 */
export function toActivityFoundRead<T>(value: T | undefined): ActivityRead<T> {
  return value === undefined ? { status: 'gone' } : { status: 'ready', value };
}

/**
 * The value of a ready read.
 *
 * @param read The read, if any.
 * @returns Its value, or undefined while it is not ready.
 */
export function toActivityReadValue<T>(read: ActivityRead<T> | undefined): T | undefined {
  return read?.status === 'ready' ? read.value : undefined;
}

/**
 * Starts one read and reports its answer tagged with the request key; a
 * rejection reports failed. An answer after the returned stop is dropped,
 * so a read for something no longer shown never lands.
 *
 * @param load The pending read.
 * @param key The request's key.
 * @param onRead Receives the tagged answer.
 * @returns Stops the read; an effect's cleanup.
 */
export function startActivityRead<T>(load: Promise<ActivityRead<T>>, key: string, onRead: (tagged: ActivityTaggedRead<T>) => void): () => void {
  let isCurrent = true;
  load
    .then((read) => isCurrent && onRead({ key, read }))
    .catch(() => isCurrent && onRead({ key, read: { status: 'failed' } }));
  return () => {
    isCurrent = false;
  };
}
