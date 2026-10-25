import type { Key } from '@heroui/react';
import { CalendarDate, Time } from '@internationalized/date';
import type { ActivityChartScale, ActivityFeedOrigin, ActivityFeedQuery, ActivityFeedType } from '../feed-source/feed.types';
import {
  ACTIVITY_ALL_TYPES_KEY,
  ACTIVITY_DAILY_SCALES,
  ACTIVITY_DEFAULT_TYPES,
  ACTIVITY_FEED_MOMENT_FORMAT,
  ACTIVITY_HOUR_MS,
  ACTIVITY_MINUTE_LAST_MS,
  ACTIVITY_RANGE_WHOLE_DAY_TIMES,
  ACTIVITY_SCALE_DAYS,
  ACTIVITY_TOGGLE_TYPES,
} from './activity-feed.constants';
import type { ActivityCalendarRange, ActivityFeedFilters, ActivityRange, ActivityRangeTimes } from './activity-feed.types';

/**
 * The filters the Activity screen opens with.
 *
 * @param nowMs The current time.
 * @returns 24 h, every origin, Traffic and System off, the failure filter off.
 */
export function createInitialFilters(nowMs: number): ActivityFeedFilters {
  return { scale: '24h', range: undefined, origin: 'all', types: ACTIVITY_DEFAULT_TYPES, failuresOnly: false, anchorMs: nowMs };
}

/** Local midnight `daysBack` days before the day of `nowMs`. */
function localDayStart(nowMs: number, daysBack: number): number {
  const day = new Date(nowMs);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - daysBack).getTime();
}

/**
 * Where a scale's chart starts, as Go draws it: 24 hourly slots ending with
 * the current hour, or N daily slots ending with today.
 *
 * @param scale The chart scale.
 * @param nowMs The current time.
 * @returns The window start, epoch milliseconds.
 */
export function scaleWindowStart(scale: ActivityChartScale, nowMs: number): number {
  if (scale === '24h') {
    return Math.floor(nowMs / ACTIVITY_HOUR_MS) * ACTIVITY_HOUR_MS - 23 * ACTIVITY_HOUR_MS;
  }
  return localDayStart(nowMs, ACTIVITY_SCALE_DAYS[scale] - 1);
}

/**
 * Builds the feed read of the filters: the selected types and, with the
 * failure switch on, only their failures. Go reads every type for an empty
 * type set, so an empty selection reads nothing instead of everything.
 *
 * @param filters The filters on screen.
 * @param cursor The page cursor; empty for the first page.
 * @param limit The page size.
 * @returns The query, or undefined when no type is selected.
 */
export function toFeedQuery(filters: ActivityFeedFilters, cursor: string, limit: number): ActivityFeedQuery | undefined {
  const { types } = filters;
  if (types.length === 0) {
    return undefined;
  }
  return {
    fromMs: filters.range?.fromMs ?? scaleWindowStart(filters.scale, filters.anchorMs),
    toMs: filters.range?.toMs ?? 0,
    origin: filters.origin,
    types,
    failuresOnly: filters.failuresOnly,
    cursor,
    limit,
  };
}

/** The known types among `keys`, in the order of `order`. */
function pickTypes(keys: Set<Key>, order: readonly ActivityFeedType[]): readonly ActivityFeedType[] {
  return order.filter((type) => keys.has(type));
}

/**
 * Applies the type toggle group's selection. "All" turns every type on; the
 * failure switch keeps its state (design, Failure button).
 *
 * @param filters The filters on screen.
 * @param keys The toggle group's new selection.
 * @param nowMs The current time; the window moves with it.
 * @returns The new filters.
 */
export function toggleFeedTypes(filters: ActivityFeedFilters, keys: Set<Key>, nowMs: number): ActivityFeedFilters {
  const wasAll = filters.types.length === ACTIVITY_TOGGLE_TYPES.length;
  const hasAll = keys.has(ACTIVITY_ALL_TYPES_KEY);
  const picked = pickTypes(keys, ACTIVITY_TOGGLE_TYPES);
  // Pressing All while every type is on deselects All alone; it never turns the types off.
  const pressedAll = hasAll ? !wasAll : wasAll && picked.length === ACTIVITY_TOGGLE_TYPES.length;
  return { ...filters, types: pressedAll ? ACTIVITY_TOGGLE_TYPES : picked, anchorMs: nowMs };
}

/**
 * The toggle group's selected keys: the types, plus "All" when every type is on.
 *
 * @param types The selected types.
 * @returns The keys.
 */
export function typeSelectionKeys(types: readonly ActivityFeedType[]): Set<Key> {
  const keys = new Set<Key>(types.length === ACTIVITY_TOGGLE_TYPES.length ? [ACTIVITY_ALL_TYPES_KEY] : []);
  for (const type of types) {
    keys.add(type);
  }
  return keys;
}

/**
 * Flips the failure switch: on, the feed shows only the failures of what the
 * types, range and origin leave; off, it shows everything again.
 *
 * @param filters The filters on screen.
 * @returns The new filters.
 */
export function toggleFailuresOnly(filters: ActivityFeedFilters): ActivityFeedFilters {
  return { ...filters, failuresOnly: !filters.failuresOnly };
}

/**
 * Applies the origin switch, keeping the current origin for an unknown key.
 *
 * @param filters The filters on screen.
 * @param keys The switch's new selection.
 * @param nowMs The current time.
 * @returns The new filters.
 */
export function setFilterOrigin(filters: ActivityFeedFilters, keys: Set<Key>, nowMs: number): ActivityFeedFilters {
  const [key] = keys;
  const origin = (['all', 'phone', 'bridge'] as const).find((value) => value === key) ?? filters.origin;
  return { ...filters, origin: origin satisfies ActivityFeedOrigin, anchorMs: nowMs };
}

/**
 * Applies the scale switch. A picked range stays picked.
 *
 * @param filters The filters on screen.
 * @param scale The picked scale.
 * @param nowMs The current time.
 * @returns The new filters.
 */
export function setFilterScale(filters: ActivityFeedFilters, scale: ActivityChartScale, nowMs: number): ActivityFeedFilters {
  return { ...filters, scale, anchorMs: nowMs };
}

/**
 * Picks or clears the range. A range older than the current chart opens the
 * smallest daily scale that contains it (design, Auto scale).
 *
 * @param filters The filters on screen.
 * @param range The range, or undefined to clear it.
 * @param nowMs The current time.
 * @returns The new filters.
 */
export function setFilterRange(filters: ActivityFeedFilters, range: ActivityRange | undefined, nowMs: number): ActivityFeedFilters {
  if (range === undefined || range.fromMs >= scaleWindowStart(filters.scale, nowMs)) {
    return { ...filters, range, anchorMs: nowMs };
  }
  const scale = ACTIVITY_DAILY_SCALES.find((daily) => range.fromMs >= scaleWindowStart(daily, nowMs)) ?? '90d';
  return { ...filters, range, scale, anchorMs: nowMs };
}

/**
 * The range field's text: the picked range, or the real window when none is
 * picked (design, Placeholder).
 *
 * @param range The picked range.
 * @param windowStartMs The scale window's start.
 * @param nowMs The current time.
 * @returns `Oct 21, 14:35 – Oct 22, 14:35`.
 */
export function formatRangeLabel(range: ActivityRange | undefined, windowStartMs: number, nowMs: number): string {
  const fromMs = range?.fromMs ?? windowStartMs;
  const toMs = range?.toMs ?? nowMs;
  return `${ACTIVITY_FEED_MOMENT_FORMAT.format(fromMs)} – ${ACTIVITY_FEED_MOMENT_FORMAT.format(toMs)}`;
}

/** The local calendar day of an instant. */
function toCalendarDate(ms: number): CalendarDate {
  const day = new Date(ms);
  return new CalendarDate(day.getFullYear(), day.getMonth() + 1, day.getDate());
}

/**
 * The calendar value of a picked range: its local days.
 *
 * @param range The picked range.
 * @returns The calendar value, or null for none.
 */
export function toCalendarRange(range: ActivityRange | undefined): ActivityCalendarRange {
  return range === undefined ? null : { start: toCalendarDate(range.fromMs), end: toCalendarDate(range.toMs) };
}

/**
 * The picker's times of a picked range, or the whole-day times when none is
 * picked (mockup: the time inputs open on the range's times, else 00:00 and 23:59).
 *
 * @param range The picked range.
 * @returns The start and end times.
 */
export function toRangeTimes(range: ActivityRange | undefined): ActivityRangeTimes {
  if (range === undefined) {
    return ACTIVITY_RANGE_WHOLE_DAY_TIMES;
  }
  const from = new Date(range.fromMs);
  const to = new Date(range.toMs);
  return { start: new Time(from.getHours(), from.getMinutes()), end: new Time(to.getHours(), to.getMinutes()) };
}

/**
 * The range of a picker Apply (mockup): the start day at the start time to the
 * end day at the end time, the end minute inclusive. When the end is before the
 * start the two swap, and the end never passes now.
 *
 * @param days The picked days.
 * @param times The start and end times.
 * @param nowMs The current time.
 * @returns The range, or undefined when no days are picked.
 */
export function fromCalendarPick(days: ActivityCalendarRange, times: ActivityRangeTimes, nowMs: number): ActivityRange | undefined {
  if (days === null) {
    return undefined;
  }
  const startMs = new Date(days.start.year, days.start.month - 1, days.start.day, times.start.hour, times.start.minute).getTime();
  const endMs = new Date(days.end.year, days.end.month - 1, days.end.day, times.end.hour, times.end.minute).getTime() + ACTIVITY_MINUTE_LAST_MS;
  const [fromMs, toMs] = endMs < startMs ? [endMs, startMs] : [startMs, endMs];
  return { fromMs, toMs: Math.min(toMs, nowMs) };
}

/**
 * The days the range calendar offers: the 90-day ledger span up to today.
 *
 * @param nowMs The current time.
 * @returns The first and last pickable days.
 */
export function toCalendarBounds(nowMs: number): { readonly minValue: CalendarDate; readonly maxValue: CalendarDate } {
  return { minValue: toCalendarDate(scaleWindowStart('90d', nowMs)), maxValue: toCalendarDate(nowMs) };
}
