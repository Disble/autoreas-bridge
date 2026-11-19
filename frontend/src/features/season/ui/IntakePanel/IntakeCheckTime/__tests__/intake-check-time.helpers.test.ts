import { Time } from '@internationalized/date';
import { describe, expect, it } from 'vitest';

import { CHECK_TIME_EMPTY_MESSAGE } from '../intake-check-time.constants';
import { formatCheckTime, toCheckTimeSaveRequest, toCheckTimeValue } from '../intake-check-time.helpers';

describe('toCheckTimeValue', () => {
  it('parses HH:MM into a time value', () => {
    const cases = [
      ['00:00', 0, 0],
      ['07:05', 7, 5],
      ['23:59', 23, 59],
    ] as const;

    for (const [hhmm, hour, minute] of cases) {
      const caseName = `parses ${String(hhmm)} into a time value`;
      expect.soft(toCheckTimeValue(hhmm), caseName).toEqual(new Time(hour, minute));
    }
  });

  it('rejects every malformed time', () => {
    const cases = ['', '9:00', '24:00', '12:60', '12:5', 'noon', ' 07:30', '07:30:00'];

    for (const hhmm of cases) {
      const caseName = `rejects ${JSON.stringify(hhmm)}`;
      expect.soft(toCheckTimeValue(hhmm), caseName).toBeNull();
    }
  });
});

describe('formatCheckTime', () => {
  it('renders a time as zero-padded HH:MM', () => {
    const cases = [
      [new Time(0, 0), '00:00'],
      [new Time(7, 5), '07:05'],
      [new Time(23, 59), '23:59'],
    ] as const;

    for (const [value, expected] of cases) {
      const caseName = `renders ${JSON.stringify(value)} as zero-padded HH:MM`;
      expect.soft(formatCheckTime(value), caseName).toBe(expected);
    }
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
