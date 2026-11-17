import { Time } from '@internationalized/date';
import { describe, expect, it } from 'vitest';

import { CHECK_TIME_EMPTY_MESSAGE } from '../intake-check-time.constants';
import { formatCheckTime, toCheckTimeSaveRequest, toCheckTimeValue } from '../intake-check-time.helpers';

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

describe('toCheckTimeSaveRequest', () => {
  it('formats a complete time as the zero-padded HH:MM to send', () => {
    expect(toCheckTimeSaveRequest(new Time(6, 5))).toEqual({ ok: true, time: '06:05' });
  });

  it('refuses an incomplete field with the message to show', () => {
    expect(toCheckTimeSaveRequest(null)).toEqual({ ok: false, message: CHECK_TIME_EMPTY_MESSAGE });
  });
});
