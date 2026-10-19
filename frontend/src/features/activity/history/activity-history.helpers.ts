import type { Key } from '@heroui/react';
import type { ActivityCalendarDay, ActivityLedgerDay, ActivityLedgerLine, ActivityWhere } from '../history-source/history.types';
import {
  ACTIVITY_CALENDAR_BEFORE_CLASS,
  ACTIVITY_CALENDAR_GAP_CLASS,
  ACTIVITY_CALENDAR_INCIDENT_CLASS,
  ACTIVITY_CALENDAR_LEVEL_CLASS,
  ACTIVITY_CALENDAR_MAX_LEVEL,
  ACTIVITY_DEFAULT_WHERE,
  ACTIVITY_DAY_FORMAT,
  ACTIVITY_GAP_NOTE,
  ACTIVITY_HISTORY_COUNT_FORMAT,
  ACTIVITY_LINE_TIME_FORMAT,
  ACTIVITY_MARK_CHIPS,
  ACTIVITY_SHORT_DATE_FORMAT,
  ACTIVITY_WHERE_OPTIONS,
} from './activity-history.constants';
import type {
  ActivityCalendarCellModel,
  ActivityCalendarCellState,
  ActivityCalendarModel,
  ActivityGapRun,
  ActivityHistoryItem,
  ActivityHistoryLineModel,
  ActivityHistoryResolvedView,
} from './activity-history.types';

/** `1 request` / `1,912 requests`. */
function formatRequests(count: number): string {
  return `${ACTIVITY_HISTORY_COUNT_FORMAT.format(count)} ${count === 1 ? 'request' : 'requests'}`;
}

/** `1 day` / `4 days`. */
function formatDays(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/** Index of the first recorded square; the calendar length when none is. */
function firstRecordedIndex(calendar: readonly ActivityCalendarDay[]): number {
  const index = calendar.findIndex((day) => day.hasData);
  return index === -1 ? calendar.length : index;
}

/** How a square is drawn, given where recording began. */
function cellState(day: ActivityCalendarDay, index: number, firstIndex: number): ActivityCalendarCellState {
  if (index < firstIndex) {
    return 'before';
  }
  return day.hasData ? 'data' : 'gap';
}

/** Fill level 0-4 against the busiest day; a quiet or missing day (total 0) is 0. */
function cellLevel(day: ActivityCalendarDay, busiest: number): number {
  return Math.ceil((day.total / busiest) * ACTIVITY_CALENDAR_MAX_LEVEL);
}

/** Hover text of one square. */
function cellTitle(day: ActivityCalendarDay, state: ActivityCalendarCellState): string {
  const facts = { before: 'before recording began', gap: 'no data', data: formatRequests(day.total) };
  const incident = day.hasIncident ? ' · incident' : '';
  return `${ACTIVITY_DAY_FORMAT.format(day.dayStartMs)} · ${facts[state]}${incident}`;
}

/** Drawing classes of one square: outline before recording, dashed gap, fill by level, red ring on incidents. */
function cellClass(state: ActivityCalendarCellState, level: number, hasIncident: boolean): string {
  const fill = { before: ACTIVITY_CALENDAR_BEFORE_CLASS, gap: ACTIVITY_CALENDAR_GAP_CLASS, data: ACTIVITY_CALENDAR_LEVEL_CLASS[level] };
  return hasIncident ? `${fill[state]} ${ACTIVITY_CALENDAR_INCIDENT_CLASS}` : fill[state];
}

/** Text alternative of the whole calendar. */
function calendarSummary(calendar: readonly ActivityCalendarDay[], cells: readonly ActivityCalendarCellModel[], firstIndex: number): string {
  if (firstIndex === calendar.length) {
    return 'Last 90 days: nothing recorded yet.';
  }
  const recorded = calendar.filter((day) => day.hasData);
  const total = recorded.reduce((sum, day) => sum + day.total, 0);
  const incidentDays = calendar.filter((day) => day.hasIncident).length;
  const gapDays = cells.filter((cell) => cell.state === 'gap').length;
  return [
    `Last 90 days: ${formatRequests(total)} over ${formatDays(recorded.length)}.`,
    `${formatDays(incidentDays)} had an incident.`,
    `${formatDays(gapDays)} ${gapDays === 1 ? 'has' : 'have'} no data.`,
    `Recording began on ${ACTIVITY_DAY_FORMAT.format(calendar[firstIndex].dayStartMs)}.`,
  ].join(' ');
}

/**
 * Turns the 90 calendar squares into drawable cells: outlined before
 * recording began, dashed for a later missing day, filled by volume otherwise,
 * with a ring on incident days and a text summary for the image.
 *
 * @param calendar The squares, oldest first.
 * @returns The drawable calendar.
 */
export function toCalendarModel(calendar: readonly ActivityCalendarDay[]): ActivityCalendarModel {
  const firstIndex = firstRecordedIndex(calendar);
  const busiest = Math.max(1, ...calendar.map((day) => day.total));
  const cells = calendar.map((day, index) => {
    const state = cellState(day, index, firstIndex);
    const level = cellLevel(day, busiest);
    return { key: day.dayStartMs, state, level, hasIncident: day.hasIncident, title: cellTitle(day, state), className: cellClass(state, level, day.hasIncident) };
  });
  const leadingBlanks = calendar.length === 0 ? 0 : new Date(calendar[0].dayStartMs).getDay();
  return { leadingBlanks, cells, summary: calendarSummary(calendar, cells, firstIndex) };
}

/**
 * Finds each run of consecutive missing days after recording began. Days
 * before the first recorded one are not gaps: nothing was recording yet.
 *
 * @param calendar The squares, oldest first.
 * @returns The gap runs, newest first.
 */
export function findCalendarGaps(calendar: readonly ActivityCalendarDay[]): readonly ActivityGapRun[] {
  const gaps: ActivityGapRun[] = [];
  let run: ActivityGapRun | undefined;
  for (const day of calendar.slice(firstRecordedIndex(calendar))) {
    if (day.hasData) {
      run = undefined;
    } else if (run === undefined) {
      run = { startMs: day.dayStartMs, endMs: day.dayStartMs };
      gaps.unshift(run);
    } else {
      run = { startMs: run.startMs, endMs: day.dayStartMs };
      gaps[0] = run;
    }
  }
  return gaps;
}

/**
 * Reads the toggle group's selection as a filter value, keeping the current
 * one for an empty or unknown selection.
 *
 * @param keys The selected toggle ids.
 * @param current The filter on screen.
 * @returns The filter to apply.
 */
export function toActivityWhere(keys: Set<Key>, current: ActivityWhere): ActivityWhere {
  const [selected] = keys;
  return ACTIVITY_WHERE_OPTIONS.find((option) => option.id === selected)?.id ?? current;
}

/**
 * Picks the resolved view: first run when nothing was ever recorded under
 * All, a filtered empty state when a filter hides every line, the calendar
 * without lines when only polling happened, and the day list otherwise.
 *
 * @param where The filter on screen.
 * @param days The loaded days.
 * @param calendar The calendar squares.
 * @returns Which resolved view renders.
 */
export function toHistoryResolvedView(
  where: ActivityWhere,
  days: readonly ActivityLedgerDay[],
  calendar: readonly ActivityCalendarDay[],
): ActivityHistoryResolvedView {
  if (days.length > 0) {
    return 'days';
  }
  if (where !== ACTIVITY_DEFAULT_WHERE) {
    return 'filtered-empty';
  }
  return calendar.some((day) => day.hasData) ? 'quiet' : 'first-run';
}

/** `kind:id`, unique across every line of History. */
function lineKey(line: ActivityLedgerLine): string {
  return `${line.kind}:${line.id}`;
}

/**
 * Appends an older page to the days on screen. A day split across two pages
 * becomes one group, and a line already shown is skipped.
 *
 * @param shown The days on screen, newest first.
 * @param incoming The older page's days, newest first.
 * @returns The merged days, newest first.
 */
export function mergeHistoryDays(shown: readonly ActivityLedgerDay[], incoming: readonly ActivityLedgerDay[]): readonly ActivityLedgerDay[] {
  const merged = [...shown];
  for (const day of incoming) {
    const last = merged.at(-1);
    if (last?.dayStartMs === day.dayStartMs) {
      const keys = new Set(last.lines.map(lineKey));
      merged[merged.length - 1] = { dayStartMs: last.dayStartMs, lines: [...last.lines, ...day.lines.filter((line) => !keys.has(lineKey(line)))] };
    } else {
      merged.push(day);
    }
  }
  return merged;
}

/** Phone time of a late fact: the time alone on the same local day, else with its date. */
function formatPhoneTime(phoneAtMs: number, atMs: number): string {
  const time = ACTIVITY_LINE_TIME_FORMAT.format(phoneAtMs);
  const isSameDay = new Date(phoneAtMs).toDateString() === new Date(atMs).toDateString();
  return isSameDay ? `Phone ${time}` : `Phone ${ACTIVITY_SHORT_DATE_FORMAT.format(phoneAtMs)}, ${time}`;
}

/**
 * Words one ledger line. The phone time shows only when Go marked the fact as
 * arrived late, which it does past its 10-minute threshold.
 *
 * @param line The ledger line.
 * @returns The line the day list renders.
 */
export function toHistoryLineModel(line: ActivityLedgerLine): ActivityHistoryLineModel {
  return {
    key: lineKey(line),
    time: ACTIVITY_LINE_TIME_FORMAT.format(line.atMs),
    phoneTime: line.marks.includes('arrived_late') && line.phoneAtMs !== undefined ? formatPhoneTime(line.phoneAtMs, line.atMs) : undefined,
    title: line.title,
    detail: line.detail,
    chips: line.marks.map((mark) => ACTIVITY_MARK_CHIPS[mark]),
  };
}

/** Words one gap block. */
function toGapItem(gap: ActivityGapRun): ActivityHistoryItem {
  return {
    kind: 'gap',
    key: `gap:${gap.startMs}`,
    label: `No data · from ${ACTIVITY_DAY_FORMAT.format(gap.startMs)} to ${ACTIVITY_DAY_FORMAT.format(gap.endMs)}`,
    note: ACTIVITY_GAP_NOTE,
  };
}

/**
 * Interleaves the day groups with the gap blocks, newest first. A gap goes
 * right before the first day older than its start; the gaps older than every
 * loaded day wait until no older page remains, so they never jump ahead of
 * days still to load.
 *
 * @param days The loaded days, newest first.
 * @param gaps The gap runs, newest first.
 * @param hasMore Whether an older page remains.
 * @returns The blocks the day list renders.
 */
export function toHistoryItems(days: readonly ActivityLedgerDay[], gaps: readonly ActivityGapRun[], hasMore: boolean): readonly ActivityHistoryItem[] {
  const items: ActivityHistoryItem[] = [];
  let gapIndex = 0;
  for (const day of days) {
    while (gapIndex < gaps.length && gaps[gapIndex].startMs > day.dayStartMs) {
      items.push(toGapItem(gaps[gapIndex]));
      gapIndex += 1;
    }
    items.push({ kind: 'day', key: `day:${day.dayStartMs}`, label: ACTIVITY_DAY_FORMAT.format(day.dayStartMs), lines: day.lines.map(toHistoryLineModel) });
  }
  if (!hasMore) {
    items.push(...gaps.slice(gapIndex).map(toGapItem));
  }
  return items;
}

/**
 * Wraps a request's settle callback so it runs only while that request is
 * still the latest; a read started under an older filter is dropped.
 *
 * @param requestIdRef The latest request id.
 * @param requestId The id of the request this callback settles.
 * @param apply What to do with the result.
 * @returns The guarded callback.
 */
export function whenCurrentRequest<T>(requestIdRef: { readonly current: number }, requestId: number, apply: (value: T) => void): (value: T) => void {
  return (value) => {
    if (requestIdRef.current === requestId) {
      apply(value);
    }
  };
}
