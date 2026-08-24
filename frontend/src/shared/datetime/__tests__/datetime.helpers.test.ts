import { describe, expect, it, vi } from 'vitest';
import { formatLocalDateTime, formatLocalTime, formatRelativeTimeAgo } from '../datetime.helpers';

/** Zero-fills a number to two digits so the expectations below can be built by hand. */
const pad = (value: number): string => String(value).padStart(2, '0');

/** One second, in milliseconds, so the relative-time boundaries below read as durations. */
const SECOND_MS = 1000;

/** One minute, in milliseconds. */
const MINUTE_MS = 60 * SECOND_MS;

/** One hour, in milliseconds. */
const HOUR_MS = 60 * MINUTE_MS;

/** One day, in milliseconds. */
const DAY_MS = 24 * HOUR_MS;

/** Fixed "now" every relative-time case below measures backwards from. */
const NOW_MS = 1_800_000_000_000;

describe('formatLocalTime', () => {
  it('formats a UTC ISO timestamp in the local timezone (HH:MM:SS)', () => {
    const iso = '2026-06-20T16:19:23Z';
    const date = new Date(iso);
    const expected = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    expect(formatLocalTime(iso)).toBe(expected);
  });

  it('drops sub-second precision', () => {
    const iso = '2026-04-13T08:01:02.123Z';
    const date = new Date(iso);
    const expected = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    expect(formatLocalTime(iso)).toBe(expected);
  });

  it('returns the raw input for an unparseable timestamp', () => {
    expect(formatLocalTime('not-a-date')).toBe('not-a-date');
  });
});

describe('formatLocalDateTime', () => {
  it('formats a UTC ISO timestamp as local YYYY-MM-DD HH:MM:SS', () => {
    const iso = '2026-06-20T16:19:23Z';
    const date = new Date(iso);
    const expected = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    expect(formatLocalDateTime(iso)).toBe(expected);
  });

  it('returns the raw input for an unparseable timestamp', () => {
    expect(formatLocalDateTime('nope')).toBe('nope');
  });
});

describe('formatRelativeTimeAgo', () => {
  it('reads "just now" for a timestamp of this very moment', () => {
    expect(formatRelativeTimeAgo(NOW_MS, NOW_MS)).toBe('just now');
  });

  it('still reads "just now" one second before the minute boundary', () => {
    expect(formatRelativeTimeAgo(NOW_MS - 59 * SECOND_MS, NOW_MS)).toBe('just now');
  });

  it('switches to minutes at exactly one minute', () => {
    expect(formatRelativeTimeAgo(NOW_MS - MINUTE_MS, NOW_MS)).toBe('1m ago');
  });

  it('reads the "5m ago" the artboard itself shows, five minutes out', () => {
    expect(formatRelativeTimeAgo(NOW_MS - 5 * MINUTE_MS, NOW_MS)).toBe('5m ago');
  });

  it('stays in minutes one second before the hour boundary', () => {
    expect(formatRelativeTimeAgo(NOW_MS - (HOUR_MS - SECOND_MS), NOW_MS)).toBe('59m ago');
  });

  it('switches to hours at exactly one hour', () => {
    expect(formatRelativeTimeAgo(NOW_MS - HOUR_MS, NOW_MS)).toBe('1h ago');
  });

  it('stays in hours one second before the day boundary', () => {
    expect(formatRelativeTimeAgo(NOW_MS - (DAY_MS - SECOND_MS), NOW_MS)).toBe('23h ago');
  });

  it('switches to days at exactly one day', () => {
    expect(formatRelativeTimeAgo(NOW_MS - DAY_MS, NOW_MS)).toBe('1d ago');
  });

  it('keeps counting in days for a record near the far end of retention', () => {
    expect(formatRelativeTimeAgo(NOW_MS - 90 * DAY_MS, NOW_MS)).toBe('90d ago');
  });

  // A timestamp ahead of the clock is not hypothetical: the backend stamps
  // records in its own process and a machine whose clock or timezone moved
  // reads them back from the future. "-3m ago" is worse than saying nothing.
  it('collapses a future timestamp to "just now" rather than rendering a negative age', () => {
    expect(formatRelativeTimeAgo(NOW_MS + 3 * MINUTE_MS, NOW_MS)).toBe('just now');
  });

  it('measures against the current clock when no explicit now is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    expect(formatRelativeTimeAgo(NOW_MS - 7 * MINUTE_MS)).toBe('7m ago');

    vi.useRealTimers();
  });
});
