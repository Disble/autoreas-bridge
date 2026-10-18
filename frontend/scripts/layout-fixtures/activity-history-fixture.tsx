import { useEffect, useState } from 'react';
import { ActivityHistoryCalendar } from '../../src/features/activity/history/ActivityHistoryCalendar';
import { ActivityHistoryDayList } from '../../src/features/activity/history/ActivityHistoryDayList';
import { ActivityWhereFilter } from '../../src/features/activity/history/ActivityWhereFilter';
import { findCalendarGaps, toCalendarModel, toHistoryItems } from '../../src/features/activity/history/activity-history.helpers';
import type { ActivityCalendarDay, ActivityLedgerDay } from '../../src/features/activity/history-source/history.types';
import { ActivityRecorderList } from '../../src/features/activity/recorder/ActivityRecorderList';
import { toRecorderLineModel, toRecorderRow } from '../../src/features/activity/recorder/activity-recorder.helpers';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Activity History tab and the 2-hour recorder.
 *
 * It mounts the REAL filter, calendar, day list and recorder list in a narrow
 * column with the longest strings they can receive. Three promises are
 * measured in headless Edge, which jsdom cannot measure: nothing widens the
 * column or the page, every one of the 90 calendar squares keeps a visible
 * size, and the six filter options stay inside the column.
 */

/** The narrow column the views are squeezed into. */
const COLUMN_WIDTH_PX = 360;

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/** The marker of this fixture's column. */
const COLUMN = '[data-activity-history-fixture]';

/** A long anime title, kept verbatim from the toast fixture's overflow case. */
const LONG_NAME = 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo';

/** Local midnight `daysAgo` days before a fixed day. */
function dayStart(daysAgo: number): number {
  return new Date(2026, 9, 18 - daysAgo).getTime();
}

/** Square `index` of the 90; a zero total is a day without data. */
function square(index: number, total: number, hasIncident: boolean): ActivityCalendarDay {
  return { dayStartMs: dayStart(89 - index), total, hasData: total > 0, hasIncident };
}

/** A recorded run of `length` squares from `first`, with an incident every 9th day. */
function recordedRun(first: number, length: number): readonly ActivityCalendarDay[] {
  return Array.from({ length }, (_unused, offset) => square(first + offset, (first + offset) * 37, offset % 9 === 0));
}

/** A run of `length` squares from `first` without data. */
function emptyRun(first: number, length: number): readonly ActivityCalendarDay[] {
  return Array.from({ length }, (_unused, offset) => square(first + offset, 0, false));
}

/** 90 squares: 20 before recording, 30 recorded, a 3-day gap, 37 recorded. */
const CALENDAR: readonly ActivityCalendarDay[] = [...emptyRun(0, 20), ...recordedRun(20, 30), ...emptyRun(50, 3), ...recordedRun(53, 37)];

/** Two days of hostile lines: every chip, a late phone time from another day, unbroken detail. */
const DAYS: readonly ActivityLedgerDay[] = [0, 45].map((daysAgo) => ({
  dayStartMs: dayStart(daysAgo),
  lines: Array.from({ length: 4 }, (_unused, index) => ({
    kind: 'change',
    id: `${daysAgo}-${index}`,
    atMs: dayStart(daysAgo) + 17 * 3_600_000,
    phoneAtMs: dayStart(daysAgo + 1) + 23 * 3_600_000,
    domain: 'anime',
    source: 'mobile',
    level: '',
    title: LONG_NAME,
    detail: 'episode_adjusted:NroCapVisto:1000→1001:from-the-phone-without-any-break-in-this-string',
    correlationId: '',
    marks: ['arrived_late', 'recovered', 'incident'],
  })),
}));

/** Recorder rows with a long route and a long event message. */
const RECORDER_LINES = [
  toRecorderRow(
    {
      source: 'request',
      id: 'r-1',
      atMs: dayStart(0),
      kind: 'http',
      route: `POST /api/sync/reconcile/${'segment/'.repeat(12)}`,
      httpStatus: 500,
      outcome: 'error',
      durationMs: 123_456,
      deviceName: 'Pixel 9 Pro XL of somebody with a long name',
      errorCode: 'list_changes_failed_because_the_bridge_could_not_read',
      domain: '',
      level: '',
      eventType: '',
      message: '',
      correlationId: '',
    },
    0,
  ),
  toRecorderRow(
    {
      source: 'event',
      id: '',
      atMs: dayStart(0),
      kind: '',
      route: '',
      httpStatus: undefined,
      outcome: '',
      durationMs: undefined,
      deviceName: '',
      errorCode: '',
      domain: 'download',
      level: 'warn',
      eventType: 'download.hoster.declared_dead',
      message: LONG_NAME,
      correlationId: '',
    },
    1,
  ),
].map(toRecorderLineModel);

/**
 * Reads back the column, its calendar squares and its filter.
 *
 * @returns Every check History and the recorder must pass.
 */
function measureActivityHistory(): readonly Check[] {
  const column = document.querySelector(COLUMN);
  if (column === null) {
    return [{ name: 'activity-history: the content rendered', ok: false, detail: 'column absent' }];
  }
  const columnRight = column.getBoundingClientRect().right;
  const nodes = [...column.querySelectorAll('*')];
  const widestNode = nodes.reduce((wide, node) => (node.getBoundingClientRect().right > wide.getBoundingClientRect().right ? node : wide), column);
  const widest = widestNode.getBoundingClientRect().right;
  const squares = [...column.querySelectorAll('[data-calendar-day]')];
  const tinySquares = squares.filter((square) => square.getBoundingClientRect().width < 4 || square.getBoundingClientRect().height < 4).length;
  return [
    {
      name: 'activity-history: no box grows past the column',
      ok: widest <= columnRight + OVERFLOW_TOLERANCE_PX,
      detail: `widest right edge ${Math.round(widest)}px (<${widestNode.tagName.toLowerCase()} class="${widestNode.getAttribute('class') ?? ''}">), column right edge ${Math.round(columnRight)}px`,
    },
    {
      name: 'activity-history: all 90 calendar squares keep a visible size',
      ok: squares.length === 90 && tinySquares === 0,
      detail: `${squares.length} squares, ${tinySquares} smaller than 4px`,
    },
    checkThePage('activity-history'),
  ];
}

/** History and the recorder in a narrow column, measured once they mounted. */
export function ActivityHistoryFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => measureWhenReady(() => document.querySelector(`${COLUMN} [data-calendar-day]`) !== null, () => setChecks(measureActivityHistory())), []);

  return (
    <>
      <div className="flex flex-col gap-4" data-activity-history-fixture style={{ width: `${COLUMN_WIDTH_PX}px` }}>
        <ActivityWhereFilter onWhereChange={() => undefined} where="phone" />
        <ActivityHistoryCalendar model={toCalendarModel(CALENDAR)} />
        <ActivityHistoryDayList isLoadingMore={false} items={toHistoryItems(DAYS, findCalendarGaps(CALENDAR), false)} onScroll={() => undefined} />
        <ActivityRecorderList isAtCap isLoadingMore={false} lines={RECORDER_LINES} onScroll={() => undefined} />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}
