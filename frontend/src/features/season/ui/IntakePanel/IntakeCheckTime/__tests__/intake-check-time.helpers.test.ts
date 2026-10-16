import { Time } from '@internationalized/date';
import { describe, expect, it, vi } from 'vitest';

import { CHECK_TIME_EMPTY_MESSAGE } from '../intake-check-time.constants';
import { formatCheckTime, readCheckTime, saveCheckTime, toCheckTimeValue } from '../intake-check-time.helpers';

describe('toCheckTimeValue', () => {
  it.each([
    ['00:00', 0, 0],
    ['07:05', 7, 5],
    ['21:00', 21, 0],
    ['23:59', 23, 59],
  ])('parses %s into a time value', (hhmm, hour, minute) => {
    expect(toCheckTimeValue(hhmm)).toEqual(new Time(hour, minute));
  });

  it.each(['', '9:00', '24:00', '12:60', '12:5', 'noon', ' 07:30', '07:30:00'])('rejects %j', (hhmm) => {
    expect(toCheckTimeValue(hhmm)).toBeNull();
  });
});

describe('formatCheckTime', () => {
  it.each([
    [new Time(0, 0), '00:00'],
    [new Time(7, 5), '07:05'],
    [new Time(23, 59), '23:59'],
  ])('renders %o as zero-padded HH:MM', (value, expected) => {
    expect(formatCheckTime(value)).toBe(expected);
  });
});

describe('readCheckTime', () => {
  it('returns the stored time when it is a valid HH:MM', async () => {
    await expect(readCheckTime({ getCheckTime: vi.fn().mockResolvedValue('06:15') })).resolves.toBe('06:15');
  });

  it.each([
    ['an unavailable runtime', vi.fn().mockResolvedValue('')],
    ['a rejected read', vi.fn().mockRejectedValue(new Error('down'))],
  ])('returns null for %s', async (_case, getCheckTime) => {
    await expect(readCheckTime({ getCheckTime })).resolves.toBeNull();
  });
});

describe('saveCheckTime', () => {
  it('sends the zero-padded time and reports it saved on "ok"', async () => {
    const setCheckTime = vi.fn().mockResolvedValue('ok');
    await expect(saveCheckTime({ setCheckTime }, new Time(6, 5))).resolves.toEqual({ ok: true, time: '06:05' });
    expect(setCheckTime).toHaveBeenCalledWith('06:05');
  });

  it('does not call the backend without a complete time', async () => {
    const setCheckTime = vi.fn();
    await expect(saveCheckTime({ setCheckTime }, null)).resolves.toEqual({ ok: false, message: CHECK_TIME_EMPTY_MESSAGE });
    expect(setCheckTime).not.toHaveBeenCalled();
  });

  it('surfaces the backend status when it is not "ok"', async () => {
    const setCheckTime = vi.fn().mockResolvedValue('settings store unavailable');
    await expect(saveCheckTime({ setCheckTime }, new Time(6, 5))).resolves.toEqual({ ok: false, message: 'settings store unavailable' });
  });

  it('surfaces a rejected save as its error message', async () => {
    const setCheckTime = vi.fn().mockRejectedValue(new Error('bridge down'));
    await expect(saveCheckTime({ setCheckTime }, new Time(6, 5))).resolves.toEqual({ ok: false, message: 'bridge down' });
  });
});
