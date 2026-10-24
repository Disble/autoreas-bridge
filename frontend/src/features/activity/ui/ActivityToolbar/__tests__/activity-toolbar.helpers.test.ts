import { Time, parseDate } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { NOW_MS, dayStart } from '../../../feed/__tests__/activity-feed.fixtures';
import { pressDraftDay, toAppliedRange, toDraftTimes, toRangeDraft, toRangeFieldModel, toWeekdayHead } from '../activity-toolbar.helpers';

describe('range picker draft', () => {
  it('opens on the picked range days and times, else on no days at 00:00 and 23:59', () => {
    const draft = toRangeDraft({ fromMs: dayStart(1) + 9 * 3_600_000, toMs: NOW_MS });

    expect(draft.days?.start.toString()).toBe('2026-10-21');
    expect(draft.days?.end.toString()).toBe('2026-10-22');
    expect([draft.start?.toString(), draft.end?.toString()]).toEqual(['09:00:00', '12:00:00']);
    expect(toRangeDraft(undefined)).toEqual({ days: null, start: new Time(0, 0), end: new Time(23, 59), anchorPending: false });
  });

  it('gives times only while both fields hold one', () => {
    const start = new Time(8, 0);
    const end = new Time(9, 0);

    expect(toDraftTimes({ days: null, start, end, anchorPending: false })).toEqual({ start, end });
    expect(toDraftTimes({ days: null, start: null, end, anchorPending: false })).toBeUndefined();
    expect(toDraftTimes({ days: null, start, end: null, anchorPending: false })).toBeUndefined();
  });
});

describe('pressDraftDay', () => {
  /** The pickable span. */
  const MIN = parseDate('2026-07-25');
  /** Today, the last pickable day. */
  const MAX = parseDate('2026-10-22');
  /** A closed draft with no days. */
  const EMPTY = toRangeDraft(undefined);

  it('picks the pressed day alone on a first press, and only ends the anchor on the next', () => {
    const day = parseDate('2026-10-20');
    const first = pressDraftDay(EMPTY, day, MIN, MAX);
    const range = { start: day, end: parseDate('2026-10-21') };

    expect(first).toEqual({ ...EMPTY, days: { start: day, end: day }, anchorPending: true });
    expect(pressDraftDay({ ...first, days: range }, parseDate('2026-10-21'), MIN, MAX)).toEqual({ ...first, days: range, anchorPending: false });
  });

  it('ignores a press outside the pickable days', () => {
    expect(pressDraftDay(EMPTY, parseDate('2026-10-23'), MIN, MAX)).toBe(EMPTY);
    expect(pressDraftDay(EMPTY, parseDate('2026-07-24'), MIN, MAX)).toBe(EMPTY);
    expect(pressDraftDay(EMPTY, MAX, MIN, MAX).anchorPending).toBe(true);
    expect(pressDraftDay(EMPTY, MIN, MIN, MAX).anchorPending).toBe(true);
  });
});

describe('toRangeFieldModel', () => {
  it('shows the picked range and offers the 90 days up to now', () => {
    const range = { fromMs: dayStart(2), toMs: dayStart(1) };
    const model = toRangeFieldModel(range, '24h', NOW_MS);

    expect(model).toMatchObject({ rangeLabel: 'Oct 20, 00:00 – Oct 21, 00:00', hasRange: true });
    expect([model.calendarMin.toString(), model.calendarMax.toString()]).toEqual(['2026-07-25', '2026-10-22']);
  });

  it('shows the scale window up to now when no range is picked', () => {
    expect(toRangeFieldModel(undefined, '7d', NOW_MS)).toMatchObject({ rangeLabel: 'Oct 16, 00:00 – Oct 22, 12:00', hasRange: false });
  });
});

describe('toAppliedRange', () => {
  /** A picked range to keep when the draft cannot apply. */
  const PICKED = { fromMs: dayStart(5), toMs: dayStart(4) };
  /** A one-day draft on Oct 20 at the whole-day times. */
  const DRAFT = { ...toRangeDraft(undefined), days: { start: parseDate('2026-10-20'), end: parseDate('2026-10-20') } };

  it('commits the draft days at their times', () => {
    expect(toAppliedRange(DRAFT, PICKED, NOW_MS)).toEqual({ fromMs: dayStart(2), toMs: dayStart(1) - 1 });
  });

  it('keeps the picked range while a time field is cleared', () => {
    expect(toAppliedRange({ ...DRAFT, end: null }, PICKED, NOW_MS)).toBe(PICKED);
  });
});

describe('toWeekdayHead', () => {
  it('draws a weekday in two letters', () => {
    expect(toWeekdayHead('Sun')).toBe('Su');
  });
});
