import { describe, expect, it, vi } from 'vitest';
import type { ActivityRead } from '../activity-run-story.types';
import {
  formatActivityClock,
  formatActivityDuration,
  formatActivityOffset,
  startActivityRead,
  toActivityCurrentRead,
  toActivityFoundRead,
  toActivityReadKey,
  toActivityReadValue,
} from '../activity-time.helpers';

/** Lets every settled promise run its handlers. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('activity-time.helpers', () => {
  it('formats a local clock with milliseconds, zero-padded', () => {
    expect(formatActivityClock(new Date(2026, 9, 17, 7, 1, 4, 5).getTime())).toBe('07:01:04.005');
    expect(formatActivityClock(new Date(2026, 9, 17, 17, 31, 44, 120).getTime())).toBe('17:31:44.120');
  });

  it.each([
    [0, '0 ms'],
    [41, '41 ms'],
    [999, '999 ms'],
    [1_000, '1.0 s'],
    [3_240, '3.2 s'],
    [59_999, '60.0 s'],
    [60_000, '1 min'],
    [125_000, '2 min 5 s'],
  ])('formats a %d ms duration as %s', (ms, expected) => {
    expect(formatActivityDuration(ms)).toBe(expected);
  });

  it.each([
    [-120_000, '−2 min'],
    [-90_000, '−1 min 30 s'],
    [-30_000, '−30 s'],
    [0, '0 s'],
    [30_000, '+30 s'],
    [400, '+0 s'],
    [60_000, '+1 min'],
    [180_000, '+3 min'],
  ])('formats a %d ms offset from the incident as %s', (ms, expected) => {
    expect(formatActivityOffset(ms)).toBe(expected);
  });

  it('keys a read by what it reads and its attempt', () => {
    expect(toActivityReadKey('c-1', 0)).toBe('c-1#0');
    expect(toActivityReadKey(42, 3)).toBe('42#3');
  });
});

describe('activity read helpers', () => {
  it('shows a tagged read only for the request it answers, else loading', () => {
    const tagged = { key: 'c-1#0', read: { status: 'failed' } } as const;
    expect(toActivityCurrentRead(tagged, 'c-1#0')).toEqual({ status: 'failed' });
    expect(toActivityCurrentRead(tagged, 'c-1#1')).toEqual({ status: 'loading' });
    expect(toActivityCurrentRead(undefined, 'c-1#0')).toEqual({ status: 'loading' });
  });

  it('reads a missing value as gone and a found one as ready', () => {
    expect(toActivityFoundRead(undefined)).toEqual({ status: 'gone' });
    expect(toActivityFoundRead(7)).toEqual({ status: 'ready', value: 7 });
  });

  it('takes the value of a ready read only', () => {
    expect(toActivityReadValue({ status: 'ready', value: 'v' })).toBe('v');
    expect(toActivityReadValue({ status: 'gone' })).toBeUndefined();
    expect(toActivityReadValue(undefined)).toBeUndefined();
  });

  it('tags an answer with its request key', async () => {
    const onRead = vi.fn();
    startActivityRead(Promise.resolve<ActivityRead<number>>({ status: 'ready', value: 3 }), 'c-1#0', onRead);
    await flush();
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ key: 'c-1#0', read: { status: 'ready', value: 3 } });
  });

  it('tags a rejected read as failed', async () => {
    const onRead = vi.fn();
    startActivityRead(Promise.reject(new Error('boom')), 'c-1#2', onRead);
    await flush();
    expect(onRead).toHaveBeenCalledExactlyOnceWith({ key: 'c-1#2', read: { status: 'failed' } });
  });

  it('drops answers that arrive after the read was stopped', async () => {
    const onRead = vi.fn();
    startActivityRead(Promise.resolve<ActivityRead<number>>({ status: 'gone' }), 'c-1#0', onRead)();
    startActivityRead(Promise.reject(new Error('boom')), 'c-1#1', onRead)();
    await flush();
    expect(onRead).not.toHaveBeenCalled();
  });
});
