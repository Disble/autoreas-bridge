import { describe, expect, it, vi } from 'vitest';
import type { ActivityCalendarDay, ActivityLedgerDay, ActivityLedgerLine } from '../../history-source/history.types';
import {
  findCalendarGaps,
  mergeHistoryDays,
  toActivityWhere,
  toCalendarModel,
  toHistoryItems,
  toHistoryLineModel,
  toHistoryResolvedView,
  whenCurrentRequest,
} from '../activity-history.helpers';

/** Local midnight of 2026-10-`day`, so labels hold in any time zone. */
function dayMs(day: number): number {
  return new Date(2026, 9, day).getTime();
}

/** Local epoch milliseconds of a wall-clock time on 2026-10-`day`. */
function atMs(day: number, hours: number, minutes: number): number {
  return new Date(2026, 9, day, hours, minutes).getTime();
}

/** One calendar square. */
function square(day: number, total: number, hasData: boolean, hasIncident = false): ActivityCalendarDay {
  return { dayStartMs: dayMs(day), total, hasData, hasIncident };
}

/** A ledger line with only the fields a case names. */
function line(overrides: Partial<ActivityLedgerLine>): ActivityLedgerLine {
  return {
    kind: 'change',
    id: '1',
    atMs: atMs(18, 17, 31),
    phoneAtMs: undefined,
    domain: 'anime',
    source: 'mobile',
    level: '',
    title: 'Date A Live IV',
    detail: 'episode 10 → 11',
    correlationId: '',
    marks: [],
    ...overrides,
  };
}

/** A day group holding lines with the given ids. */
function group(day: number, ids: readonly string[]): ActivityLedgerDay {
  return { dayStartMs: dayMs(day), lines: ids.map((id) => line({ id })) };
}

describe('toCalendarModel', () => {
  // Oct 10-11 before recording, data from Oct 12, a gap on Oct 14-15.
  const calendar = [
    square(10, 0, false),
    square(11, 0, false),
    square(12, 100, true, true),
    square(13, 0, true),
    square(14, 0, false, true),
    square(15, 0, false),
    square(16, 25, true),
    square(17, 50, true),
  ];

  it('draws days before recording began as outlined, later missing days as gaps', () => {
    const model = toCalendarModel(calendar);

    expect(model.cells.map((cell) => cell.state)).toEqual(['before', 'before', 'data', 'data', 'gap', 'gap', 'data', 'data']);
  });

  it('scales each data day against the busiest one, a quiet day staying at zero', () => {
    expect(toCalendarModel(calendar).cells.map((cell) => cell.level)).toEqual([0, 0, 4, 0, 0, 0, 1, 2]);
  });

  it('rings incident days and titles each square', () => {
    const { cells } = toCalendarModel(calendar);

    expect(cells.map((cell) => cell.hasIncident)).toEqual([false, false, true, false, true, false, false, false]);
    expect(cells[0].title).toBe('Sat, Oct 10 · before recording began');
    expect(cells[2].title).toBe('Mon, Oct 12 · 100 requests · incident');
    expect(cells[3].title).toBe('Tue, Oct 13 · 0 requests');
    expect(cells[4].title).toBe('Wed, Oct 14 · no data · incident');
    expect(cells[7].key).toBe(dayMs(17));
  });

  it('outlines days before recording, dashes gaps, fills by level and rings incidents', () => {
    expect(toCalendarModel(calendar).cells.map((cell) => cell.className)).toEqual([
      'border border-separator',
      'border border-separator',
      'bg-accent ring-2 ring-danger',
      'bg-default',
      'border border-dashed border-muted ring-2 ring-danger',
      'border border-dashed border-muted',
      'bg-accent/25',
      'bg-accent/50',
    ]);
  });

  it('offsets the first square to its weekday', () => {
    expect(toCalendarModel(calendar).leadingBlanks).toBe(new Date(2026, 9, 10).getDay());
    expect(toCalendarModel([]).leadingBlanks).toBe(0);
  });

  it('summarizes the totals, incident days, gaps and when recording began', () => {
    expect(toCalendarModel(calendar).summary).toBe(
      'Last 90 days: 175 requests over 4 days. 2 days had an incident. 2 days have no data. Recording began on Mon, Oct 12.',
    );
  });

  it('summarizes a calendar with nothing recorded', () => {
    expect(toCalendarModel([square(10, 0, false), square(11, 0, false)]).summary).toBe('Last 90 days: nothing recorded yet.');
    expect(toCalendarModel([square(10, 0, false), square(11, 0, false)]).cells.map((cell) => cell.state)).toEqual(['before', 'before']);
  });

  it('words a single request and a single day in the singular', () => {
    expect(toCalendarModel([square(12, 1, true, true), square(13, 0, false)]).summary).toBe(
      'Last 90 days: 1 request over 1 day. 1 day had an incident. 1 day has no data. Recording began on Mon, Oct 12.',
    );
  });
});

describe('findCalendarGaps', () => {
  it('returns each run of missing days after recording began, newest first', () => {
    const gaps = findCalendarGaps([
      square(10, 0, false),
      square(11, 5, true),
      square(12, 0, false),
      square(13, 0, false),
      square(14, 5, true),
      square(15, 0, false),
    ]);

    expect(gaps).toEqual([
      { startMs: dayMs(15), endMs: dayMs(15) },
      { startMs: dayMs(12), endMs: dayMs(13) },
    ]);
  });

  it('finds no gap before recording began or when nothing was recorded', () => {
    expect(findCalendarGaps([square(10, 0, false), square(11, 1, true)])).toEqual([]);
    expect(findCalendarGaps([square(10, 0, false)])).toEqual([]);
  });
});

describe('mergeHistoryDays', () => {
  it('appends older days and joins a day split across two pages, without duplicate lines', () => {
    const merged = mergeHistoryDays([group(18, ['a']), group(17, ['b', 'c'])], [group(17, ['c', 'd']), group(16, ['e'])]);

    expect(merged.map((day) => [day.dayStartMs, day.lines.map((entry) => entry.id)])).toEqual([
      [dayMs(18), ['a']],
      [dayMs(17), ['b', 'c', 'd']],
      [dayMs(16), ['e']],
    ]);
  });

  it('keeps lines of different kinds that share an id', () => {
    const merged = mergeHistoryDays([group(18, ['1'])], [{ dayStartMs: dayMs(18), lines: [line({ kind: 'event', id: '1' })] }]);

    expect(merged[0].lines.map((entry) => entry.kind)).toEqual(['change', 'event']);
  });

  it('returns the incoming page when nothing is shown yet', () => {
    expect(mergeHistoryDays([], [group(16, ['e'])])).toEqual([group(16, ['e'])]);
  });
});

describe('toHistoryLineModel', () => {
  it('words a line with its local time and chips', () => {
    expect(toHistoryLineModel(line({ id: '7', marks: ['recovered', 'incident'] }))).toEqual({
      key: 'change:7',
      time: '17:31',
      phoneTime: undefined,
      title: 'Date A Live IV',
      detail: 'episode 10 → 11',
      chips: [
        { label: 'Recovered', color: 'warning' },
        { label: 'Incident', color: 'danger' },
      ],
    });
  });

  it('shows the phone time beside the bridge time when the fact arrived late', () => {
    const model = toHistoryLineModel(line({ phoneAtMs: atMs(18, 17, 2), marks: ['arrived_late'] }));

    expect(model.phoneTime).toBe('Phone 17:02');
    expect(model.chips).toEqual([{ label: 'Arrived late', color: 'warning' }]);
  });

  it('dates a phone time from another day', () => {
    expect(toHistoryLineModel(line({ phoneAtMs: atMs(17, 23, 58), marks: ['arrived_late'] })).phoneTime).toBe('Phone Oct 17, 23:58');
  });

  it('hides the phone time of a fact that arrived on time', () => {
    expect(toHistoryLineModel(line({ phoneAtMs: atMs(18, 17, 30) })).phoneTime).toBeUndefined();
    expect(toHistoryLineModel(line({ marks: ['arrived_late'] })).phoneTime).toBeUndefined();
  });
});

describe('toHistoryItems', () => {
  const days = [group(18, ['a']), group(16, ['b']), group(12, ['c'])];
  const gaps = [
    { startMs: dayMs(17), endMs: dayMs(17) },
    { startMs: dayMs(13), endMs: dayMs(15) },
    { startMs: dayMs(10), endMs: dayMs(11) },
  ];

  it('places each gap between the days around it, newest first', () => {
    const items = toHistoryItems(days, gaps, true);

    expect(items.map((item) => item.key)).toEqual([`day:${dayMs(18)}`, `gap:${dayMs(17)}`, `day:${dayMs(16)}`, `gap:${dayMs(13)}`, `day:${dayMs(12)}`]);
  });

  it('places the gaps older than every loaded day only once no older page remains', () => {
    expect(toHistoryItems(days, gaps, false).at(-1)?.key).toBe(`gap:${dayMs(10)}`);
  });

  it('puts a gap newer than every day first, and a gap holding a day after that day', () => {
    const items = toHistoryItems([group(14, ['x']), group(12, ['y'])], [{ startMs: dayMs(16), endMs: dayMs(17) }, { startMs: dayMs(13), endMs: dayMs(14) }], true);

    expect(items.map((item) => item.key)).toEqual([`gap:${dayMs(16)}`, `day:${dayMs(14)}`, `gap:${dayMs(13)}`, `day:${dayMs(12)}`]);
  });

  it('puts a gap that starts on a loaded day after that day', () => {
    const items = toHistoryItems([group(14, ['x']), group(12, ['y'])], [{ startMs: dayMs(14), endMs: dayMs(15) }], true);

    expect(items.map((item) => item.key)).toEqual([`day:${dayMs(14)}`, `gap:${dayMs(14)}`, `day:${dayMs(12)}`]);
  });

  it('words a day group and a gap block', () => {
    const [day, gap] = toHistoryItems([group(18, ['a'])], [{ startMs: dayMs(13), endMs: dayMs(15) }], false);

    expect(day).toEqual(expect.objectContaining({ kind: 'day', label: 'Sun, Oct 18' }));
    expect(day.kind === 'day' ? day.lines.map((entry) => entry.key) : []).toEqual(['change:a']);
    expect(gap).toEqual({
      kind: 'gap',
      key: `gap:${dayMs(13)}`,
      label: 'No data · from Tue, Oct 13 to Thu, Oct 15',
      note: 'Phone changes from this time may still arrive late.',
    });
  });
});

describe('toActivityWhere', () => {
  it('reads the selected toggle as the filter', () => {
    expect(toActivityWhere(new Set(['downloads']), 'all')).toBe('downloads');
    expect(toActivityWhere(new Set(['phone']), 'season')).toBe('phone');
  });

  it('keeps the current filter for an empty or unknown selection', () => {
    expect(toActivityWhere(new Set(), 'editor')).toBe('editor');
    expect(toActivityWhere(new Set(['mobile']), 'schedule')).toBe('schedule');
  });
});

describe('toHistoryResolvedView', () => {
  const recorded = [square(12, 5, true)];
  const unrecorded = [square(12, 0, false)];

  it.each([
    { where: 'all', days: [group(12, ['a'])], calendar: unrecorded, expected: 'days' },
    { where: 'season', days: [group(12, ['a'])], calendar: recorded, expected: 'days' },
    { where: 'season', days: [], calendar: recorded, expected: 'filtered-empty' },
    { where: 'phone', days: [], calendar: unrecorded, expected: 'filtered-empty' },
    { where: 'all', days: [], calendar: recorded, expected: 'quiet' },
    { where: 'all', days: [], calendar: unrecorded, expected: 'first-run' },
  ] as const)('where $where with $days.length days → $expected', ({ where, days, calendar, expected }) => {
    expect(toHistoryResolvedView(where, days, calendar)).toBe(expected);
  });
});

describe('whenCurrentRequest', () => {
  it('applies a result only while its request is still the latest', () => {
    const requestIdRef = { current: 3 };
    const apply = vi.fn();
    const settle = whenCurrentRequest(requestIdRef, 3, apply);

    settle('page');
    requestIdRef.current = 4;
    settle('stale');

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('page');
  });
});
