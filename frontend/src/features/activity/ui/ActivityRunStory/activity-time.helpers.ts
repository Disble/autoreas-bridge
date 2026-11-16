import { ACTIVITY_RUN_MINUTE_MS, ACTIVITY_SECOND_MS } from './activity-run-story.constants';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import type { ActivityRead } from './activity-run-story.types';

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
 * Whether a by-id read found nothing; `toAsyncView` shows it as empty.
 *
 * @param read What the reader answered.
 * @returns True when the lookup found nothing.
 */
export function isActivityReadGone<T>(read: ActivityRead<T>): boolean {
  return read.status === 'gone';
}

/**
 * The read one by-id query shows: loading while it is pending or fetching, so
 * a new id and "Try again" stay loading until their own answer arrives; failed
 * on an error; gone when the lookup found nothing; the reader's answer otherwise.
 *
 * @param view The query's async view (`toAsyncView` with `isActivityReadGone`).
 * @param isFetching Whether the query is reading right now.
 * @returns The read the detail panes render.
 */
export function toActivityQueryRead<T>(view: AsyncView<ActivityRead<T>>, isFetching: boolean): ActivityRead<T> {
  if (isFetching || view.kind === 'loading') {
    return { status: 'loading' };
  }
  if (view.kind === 'failure') {
    return { status: 'failed' };
  }
  return view.kind === 'empty' ? { status: 'gone' } : view.data;
}
