import { describe, expect, it } from 'vitest';
import { missedNoticeReset, selectMissedNotice, shouldRefreshMissedResult } from '../missed-schedule-notice.helpers';

describe('missed notice decisions', () => {
  it.each([['settled', true], ['already_resolved', true], ['not_available', true], ['unresolved_terminal', true], ['run_in_progress', false], ['error', false]] as const)(
    'refreshes %s: %s', (kind, expected) => expect(shouldRefreshMissedResult(kind, true)).toBe(expected),
  );
  it.each([[undefined, 'a', false, false], ['a', 'a', false, false], ['a', 'b', false, true], ['a', 'a', true, true], ['a', 'b', true, false]] as const)(
    'selects a notice for matching or nonmatching dates', (date, marker, matching, expected) => {
      const notice = date === undefined ? undefined : { localDate: date, dueAtMs: 0 };
      expect(selectMissedNotice(notice, marker, matching)).toBe(expected ? notice : undefined);
    },
  );
  it('does not refresh unresolved terminal on ignore', () => expect(shouldRefreshMissedResult('unresolved_terminal', false)).toBe(false));
  it.each([[undefined, undefined, undefined, true, true], ['a', 'a', 'a', false, false], ['b', 'a', 'b', true, false], ['b', undefined, 'a', false, true]] as const)(
    'reconciles notice dates', (date, hidden, failed, restore, clear) => expect(missedNoticeReset(date, hidden, failed)).toEqual({ restore, clear }),
  );
});
