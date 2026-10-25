import { type CalendarDate, parseDate } from '@internationalized/date';
import { formatRangeLabel, fromCalendarPick, scaleWindowStart, toCalendarBounds, toCalendarRange, toRangeTimes } from '../../feed/activity-feed-filters.helpers';
import type { ActivityRange, ActivityRangeTimes } from '../../feed/activity-feed.types';
import type { ActivityChartScale } from '../../feed-source/feed.types';
import type { ActivityDayKey, ActivityRangeDraft, ActivityRangeFieldModel } from './activity-toolbar.types';

/**
 * The range field's text and pickable days: the picked range, or the scale's
 * real window when none is picked, and the 90-day ledger span up to now.
 *
 * @param range The picked range.
 * @param scale The chart scale whose window the field shows without a range.
 * @param nowMs The filters' anchor time.
 * @returns The field model.
 */
export function toRangeFieldModel(range: ActivityRange | undefined, scale: ActivityChartScale, nowMs: number): ActivityRangeFieldModel {
  const bounds = toCalendarBounds(nowMs);
  return {
    rangeLabel: formatRangeLabel(range, scaleWindowStart(scale, nowMs), nowMs),
    hasRange: range !== undefined,
    calendarMin: bounds.minValue,
    calendarMax: bounds.maxValue,
  };
}

/**
 * The draft the range picker opens on (mockup `openPop`): the picked range's
 * days and times, else no days at 00:00 and 23:59.
 *
 * @param range The picked range.
 * @returns The opening draft.
 */
export function toRangeDraft(range: ActivityRange | undefined): ActivityRangeDraft {
  return { days: toCalendarRange(range), ...toRangeTimes(range), anchorPending: false };
}

/**
 * The draft's times when both fields hold one.
 *
 * @param draft The draft.
 * @returns The times, or undefined while a field is cleared.
 */
export function toDraftTimes(draft: ActivityRangeDraft): ActivityRangeTimes | undefined {
  return draft.start === null || draft.end === null ? undefined : { start: draft.start, end: draft.end };
}

/**
 * A pointer press on a calendar day (mockup cal click): the first press of a
 * range picks that one day, so Apply can commit it; the next press only ends
 * the anchor, since the calendar has already reported the full range. A press
 * on a day outside the pickable span changes nothing.
 *
 * @param draft The draft.
 * @param date The pressed day.
 * @param minValue First pickable day.
 * @param maxValue Last pickable day.
 * @returns The next draft.
 */
export function pressDraftDay(draft: ActivityRangeDraft, date: CalendarDate, minValue: CalendarDate, maxValue: CalendarDate): ActivityRangeDraft {
  if (date.compare(minValue) < 0 || date.compare(maxValue) > 0) {
    return draft;
  }
  if (draft.anchorPending) {
    return { ...draft, anchorPending: false };
  }
  return { ...draft, days: { start: date, end: date }, anchorPending: true };
}

/**
 * The day a key down presses, as React Aria does: Enter or Space on a day
 * cell, not a held key's repeats. The cell carries its date in `data-day`.
 *
 * @param key The key down.
 * @returns The pressed day, or undefined when the key presses none.
 */
export function toKeyPressedDay(key: ActivityDayKey): CalendarDate | undefined {
  if (key.repeat || (key.key !== 'Enter' && key.key !== ' ') || !(key.target instanceof Element)) {
    return undefined;
  }
  const day = key.target.closest('[data-day]')?.getAttribute('data-day');
  return day ? parseDate(day) : undefined;
}

/**
 * A key down on the calendar applied to the draft: Enter or Space on a day
 * presses it exactly like a pointer (`pressDraftDay`); any other key leaves the
 * draft as it is.
 *
 * @param draft The draft.
 * @param key The key down.
 * @param minValue First pickable day.
 * @param maxValue Last pickable day.
 * @returns The next draft.
 */
export function pressDraftDayByKey(draft: ActivityRangeDraft, key: ActivityDayKey, minValue: CalendarDate, maxValue: CalendarDate): ActivityRangeDraft {
  const date = toKeyPressedDay(key);
  return date === undefined ? draft : pressDraftDay(draft, date, minValue, maxValue);
}

/**
 * The range Apply commits (mockup Apply): the draft's days at its times. A
 * draft with a cleared time field cannot be applied (Apply is disabled), so it
 * keeps the picked range.
 *
 * @param draft The draft.
 * @param range The picked range.
 * @param nowMs The current time; the range never ends after it.
 * @returns The range to commit, or undefined for none.
 */
export function toAppliedRange(draft: ActivityRangeDraft, range: ActivityRange | undefined, nowMs: number): ActivityRange | undefined {
  const times = toDraftTimes(draft);
  return times === undefined ? range : fromCalendarPick(draft.days, times, nowMs);
}

/**
 * A weekday head of the range calendar in two letters, as the mockup draws them.
 *
 * @param day The calendar's short weekday name, `Sun`.
 * @returns `Su`.
 */
export function toWeekdayHead(day: string): string {
  return day.slice(0, 2);
}
