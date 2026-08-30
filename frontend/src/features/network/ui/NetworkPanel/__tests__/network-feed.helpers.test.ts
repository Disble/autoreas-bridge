import { describe, expect, it } from 'vitest';
import type { RuntimeEventCountGroup } from '../../../../../shared/contracts/runtime-event.types';
import {
  admitOverlayEntry,
  mergeEventFeed,
  reconcileVisibleEventCount,
  selectHeadRows,
  toDomainFilterOptions,
  toEventQueryFilters,
} from '../network-feed.helpers';
import type { EventFeedFilters, RuntimeEventRow } from '../network-panel.types';

/** Builds one runtime-event feed row, overridable field by field per test. */
function row(overrides: Partial<RuntimeEventRow> = {}): RuntimeEventRow {
  return {
    id: 'event-1',
    occurredAtMs: 1_000,
    domain: 'sync',
    level: 'info',
    message: 'sync started',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids and descending timestamps. */
function rows(count: number): readonly RuntimeEventRow[] {
  return Array.from({ length: count }, (_unused, index) => row({ id: `event-${index}`, occurredAtMs: 10_000 - index }));
}

/** Builds the active feed filter set, defaulting to "nothing filtered out". */
function filters(overrides: Partial<EventFeedFilters> = {}): EventFeedFilters {
  return { query: '', level: 'all', domain: 'all', ...overrides };
}

/** Builds one summary aggregate bucket as `SummarizeRuntimeEvents` returns it. */
function group(key: string, count: number): RuntimeEventCountGroup {
  return { key, count };
}

describe('reconcileVisibleEventCount — rule 1: an empty feed falls back to the initial batch', () => {
  it('returns the initial batch size when the next feed is empty', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 37,
      previousTotal: 40,
      nextRows: [],
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(20);
  });
});

describe('reconcileVisibleEventCount — rule 2: the window follows head insertions', () => {
  it('grows the window by the prepended count so no rendered row is pushed out of view', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 20,
      previousTotal: 50,
      nextRows: rows(51),
      selectedId: null,
      prependedCount: 1,
      initialCount: 20,
    });

    expect(visibleCount).toBe(21);
  });

  it('leaves the window untouched when a page is appended at the tail', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 20,
      previousTotal: 50,
      nextRows: rows(100),
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(20);
  });

  it('never renders fewer rows than the initial batch', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 2,
      previousTotal: 0,
      nextRows: rows(40),
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(20);
  });
});

describe('reconcileVisibleEventCount — rule 3: a fully revealed feed stays fully revealed', () => {
  it('reveals every row when the previous window already covered the whole feed', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 20,
      previousTotal: 20,
      nextRows: rows(25),
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(25);
  });

  it('does not treat a first load as fully revealed', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 0,
      previousTotal: 0,
      nextRows: rows(40),
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(20);
  });
});

describe('reconcileVisibleEventCount — rule 4: the selected row stays rendered', () => {
  it('extends the window down to the selected row', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 20,
      previousTotal: 50,
      nextRows: rows(50),
      selectedId: 'event-29',
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(30);
  });

  it('leaves the window alone when the selected row is no longer in the feed', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 20,
      previousTotal: 50,
      nextRows: rows(50),
      selectedId: 'event-does-not-exist',
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(20);
  });
});

describe('reconcileVisibleEventCount — rule 5: the window never exceeds the feed', () => {
  it('clamps a window larger than the feed down to the row count', () => {
    const visibleCount = reconcileVisibleEventCount({
      currentVisibleCount: 100,
      previousTotal: 0,
      nextRows: rows(3),
      selectedId: null,
      prependedCount: 0,
      initialCount: 20,
    });

    expect(visibleCount).toBe(3);
  });
});

describe('admitOverlayEntry', () => {
  it('admits an entry newer than the persisted head', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001 }),
      head: 2_000,
      headRows: [row({ id: 'event-9', occurredAtMs: 2_000 })],
      filters: filters(),
    });

    expect(admitted).toBe(true);
  });

  it('drops an entry at the head millisecond that the persisted head already carries', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_000, message: 'sync started' }),
      head: 2_000,
      headRows: [row({ id: 'event-9', occurredAtMs: 2_000, message: 'sync started' })],
      filters: filters(),
    });

    expect(admitted).toBe(false);
  });

  it('admits a distinct entry sharing the head millisecond', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_000, message: 'sync finished' }),
      head: 2_000,
      headRows: [row({ id: 'event-9', occurredAtMs: 2_000, message: 'sync started' })],
      filters: filters(),
    });

    expect(admitted).toBe(true);
  });

  it('drops an entry older than the persisted head, which belongs to a page and not to the overlay', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 1_999 }),
      head: 2_000,
      headRows: [row({ id: 'event-9', occurredAtMs: 2_000 })],
      filters: filters(),
    });

    expect(admitted).toBe(false);
  });

  it('admits any entry before a first page has established a head', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 5 }),
      head: null,
      headRows: [],
      filters: filters(),
    });

    expect(admitted).toBe(true);
  });

  it('drops an entry matching any one of several rows sharing the head millisecond', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_000, message: 'sync finished' }),
      head: 2_000,
      headRows: [
        row({ id: 'event-8', occurredAtMs: 2_000, message: 'sync started' }),
        row({ id: 'event-9', occurredAtMs: 2_000, message: 'sync finished' }),
      ],
      filters: filters(),
    });

    expect(admitted).toBe(false);
  });

  it('admits an entry whose domain matches the active domain filter, whatever its casing', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, domain: 'Download' }),
      head: 2_000,
      headRows: [],
      filters: filters({ domain: 'download' }),
    });

    expect(admitted).toBe(true);
  });

  it('admits an entry whose level matches the active level filter, whatever its casing', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, level: 'Error' }),
      head: 2_000,
      headRows: [],
      filters: filters({ level: 'error' }),
    });

    expect(admitted).toBe(true);
  });

  it('matches the free-text filter against the message alone, whatever its casing', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, domain: 'bus', message: 'Reconcile QUEUED' }),
      head: 2_000,
      headRows: [],
      filters: filters({ query: 'queued' }),
    });

    expect(admitted).toBe(true);
  });

  it('matches the free-text filter against the domain alone', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, domain: 'schedule', message: 'tick' }),
      head: 2_000,
      headRows: [],
      filters: filters({ query: 'schedule' }),
    });

    expect(admitted).toBe(true);
  });

  it('does not admit an entry outside the active domain filter', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, domain: 'download' }),
      head: 2_000,
      headRows: [],
      filters: filters({ domain: 'sync' }),
    });

    expect(admitted).toBe(false);
  });

  it('does not admit an entry outside the active level filter', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, level: 'info' }),
      head: 2_000,
      headRows: [],
      filters: filters({ level: 'error' }),
    });

    expect(admitted).toBe(false);
  });

  it('does not admit an entry outside the active free-text filter', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, message: 'sync started' }),
      head: 2_000,
      headRows: [],
      filters: filters({ query: 'download' }),
    });

    expect(admitted).toBe(false);
  });

  it('admits an entry whose event type matches the active free-text filter', () => {
    const admitted = admitOverlayEntry({
      entry: row({ id: 'overlay-1', occurredAtMs: 2_001, eventType: 'download.started' }),
      head: 2_000,
      headRows: [],
      filters: filters({ query: 'download' }),
    });

    expect(admitted).toBe(true);
  });
});

describe('toDomainFilterOptions', () => {
  it('derives a domain the previous hardcoded option list never contained', () => {
    const options = toDomainFilterOptions([group('websocket', 1_693), group('download', 463)]);

    expect(options).toEqual([
      { value: 'all', label: 'All' },
      { value: 'websocket', label: 'Websocket' },
      { value: 'download', label: 'Download' },
    ]);
  });

  it('preserves the count-descending order the summary aggregate returns', () => {
    const options = toDomainFilterOptions([group('sync', 1_262), group('api', 368), group('schedule', 2)]);

    expect(options.map((option) => option.value)).toEqual(['all', 'sync', 'api', 'schedule']);
  });

  it('offers only the all-domains sentinel for an empty aggregate and fabricates no names', () => {
    const options = toDomainFilterOptions([]);

    expect(options).toEqual([{ value: 'all', label: 'All' }]);
  });

  it('skips a blank domain key rather than offering an unlabelled option', () => {
    const options = toDomainFilterOptions([group('', 12), group('bus', 4)]);

    expect(options).toEqual([
      { value: 'all', label: 'All' },
      { value: 'bus', label: 'Bus' },
    ]);
  });
});

describe('mergeEventFeed', () => {
  it('places the overlay ahead of the persisted page without reordering either side', () => {
    const overlay = [row({ id: 'overlay-2', occurredAtMs: 3_002 }), row({ id: 'overlay-1', occurredAtMs: 3_001 })];
    const page = [row({ id: 'event-9', occurredAtMs: 3_000 }), row({ id: 'event-8', occurredAtMs: 2_999 })];

    const feed = mergeEventFeed(overlay, page);

    expect(feed.map((entry) => entry.id)).toEqual(['overlay-2', 'overlay-1', 'event-9', 'event-8']);
  });

  it('never duplicates a persisted row that the overlay also holds', () => {
    const overlay = [row({ id: 'event-9', occurredAtMs: 3_000 })];
    const page = [row({ id: 'event-9', occurredAtMs: 3_000 }), row({ id: 'event-8', occurredAtMs: 2_999 })];

    const feed = mergeEventFeed(overlay, page);

    expect(feed.map((entry) => entry.id)).toEqual(['event-9', 'event-8']);
  });

  it('returns the very same page reference when the overlay is empty', () => {
    const page = rows(3);

    expect(mergeEventFeed([], page)).toBe(page);
  });
});

describe('selectHeadRows', () => {
  it('returns every persisted row sharing the head millisecond, which is the only fingerprint collision window', () => {
    const page = [
      row({ id: 'event-9', occurredAtMs: 3_000, message: 'first at head' }),
      row({ id: 'event-8', occurredAtMs: 3_000, message: 'second at head' }),
      row({ id: 'event-7', occurredAtMs: 2_999, message: 'older' }),
    ];

    expect(selectHeadRows(page, 3_000).map((entry) => entry.id)).toEqual(['event-9', 'event-8']);
  });

  it('returns nothing before a first page has anchored a head', () => {
    expect(selectHeadRows(rows(3), null)).toEqual([]);
  });

  it('returns nothing when no persisted row holds the head millisecond', () => {
    expect(selectHeadRows([row({ id: 'event-9', occurredAtMs: 2_999 })], 3_000)).toEqual([]);
  });
});

describe('toEventQueryFilters', () => {
  it('sends every active filter to the backend so a match outside the loaded page is still reachable', () => {
    expect(toEventQueryFilters(filters({ query: 'timeout', level: 'error', domain: 'download' }))).toEqual({
      text: 'timeout',
      level: 'error',
      domain: 'download',
    });
  });

  it('omits the all-domains sentinel rather than sending it as a real domain named "all"', () => {
    expect(toEventQueryFilters(filters({ domain: 'all' })).domain).toBeUndefined();
  });

  it('omits the all-levels sentinel rather than sending it as a real level named "all"', () => {
    expect(toEventQueryFilters(filters({ level: 'all' })).level).toBeUndefined();
  });

  it('omits an empty free-text filter so it does not narrow the query to rows containing ""', () => {
    expect(toEventQueryFilters(filters({ query: '' })).text).toBeUndefined();
  });
});
