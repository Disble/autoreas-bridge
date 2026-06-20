import { describe, expect, it } from 'vitest';
import { formatLocalDateTime, formatLocalTime } from '../datetime.helpers';

const pad = (value: number): string => String(value).padStart(2, '0');

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
