import { describe, expect, it } from 'vitest';
import type { ActivityRecorderEntry } from '../../activity-source/activity.types';
import {
  appendOlderRecorderRows,
  canLoadOlderRecorderRows,
  toRecorderLineModel,
  toRecorderRow,
  upsertRecorderRow,
} from '../activity-recorder.helpers';
import type { ActivityRecorderRow } from '../activity-recorder.types';

/** A recorder row with only the fields a case names. */
function entry(overrides: Partial<ActivityRecorderEntry>): ActivityRecorderEntry {
  return {
    source: 'request',
    id: '',
    atMs: 0,
    kind: '',
    route: '',
    httpStatus: undefined,
    outcome: '',
    durationMs: undefined,
    deviceName: '',
    errorCode: '',
    domain: '',
    level: '',
    eventType: '',
    message: '',
    correlationId: '',
    ...overrides,
  };
}

/** Local epoch milliseconds of a wall-clock time today, so labels hold in any time zone. */
function localMs(hours: number, minutes: number, seconds: number): number {
  return new Date(2026, 9, 18, hours, minutes, seconds).getTime();
}

describe('toRecorderRow', () => {
  it('keys a row by source and id, so a request and an event sharing an id stay apart', () => {
    expect(toRecorderRow(entry({ id: '7' }), 1).key).toBe('request:7');
    expect(toRecorderRow(entry({ source: 'event', id: '7' }), 1).key).toBe('event:7');
  });

  it('gives a row without an id a key from its sequence', () => {
    expect(toRecorderRow(entry({ source: 'event' }), 3).key).toBe('event:live:3');
    expect(toRecorderRow(entry({ source: 'event' }), 4).key).not.toBe(toRecorderRow(entry({ source: 'event' }), 3).key);
  });
});

describe('upsertRecorderRow', () => {
  const pending = toRecorderRow(entry({ id: 'r-1', outcome: 'pending' }), 0);
  const answered = toRecorderRow(entry({ id: 'r-1', outcome: 'ok', httpStatus: 200 }), 1);

  it('prepends a new row', () => {
    const older = toRecorderRow(entry({ id: 'r-0' }), 0);

    expect(upsertRecorderRow([older], pending, 500).map((row) => row.key)).toEqual(['request:r-1', 'request:r-0']);
  });

  it('replaces the pending emit of a request with its terminal emit, in place', () => {
    const newer = toRecorderRow(entry({ id: 'r-2' }), 2);

    const rows = upsertRecorderRow([newer, pending], answered, 500);

    expect(rows).toHaveLength(2);
    expect(rows[1].entry.httpStatus).toBe(200);
    expect(rows[0].key).toBe('request:r-2');
  });

  it('keeps a terminal row when its pending emit arrives late', () => {
    const rows = upsertRecorderRow([answered], pending, 500);

    expect(rows).toHaveLength(1);
    expect(rows[0].entry.outcome).toBe('ok');
  });

  it('lets one terminal emit replace another', () => {
    const failed = toRecorderRow(entry({ id: 'r-1', outcome: 'error', httpStatus: 500 }), 2);

    expect(upsertRecorderRow([answered], failed, 500)[0].entry.httpStatus).toBe(500);
  });

  it('appends every event without an id, even identical ones', () => {
    const first = toRecorderRow(entry({ source: 'event', message: 'm' }), 1);
    const second = toRecorderRow(entry({ source: 'event', message: 'm' }), 2);

    expect(upsertRecorderRow(upsertRecorderRow([], first, 500), second, 500)).toHaveLength(2);
  });

  it('holds at most the cap after 10,000 pushes, newest first', () => {
    let rows: readonly ActivityRecorderRow[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      rows = upsertRecorderRow(rows, toRecorderRow(entry({ id: `r-${index}` }), index), 500);
    }

    expect(rows).toHaveLength(500);
    expect(rows[0].key).toBe('request:r-9999');
    expect(rows[499].key).toBe('request:r-9500');
  });
});

describe('appendOlderRecorderRows', () => {
  it('appends an older page after the rows on screen, skipping rows already shown', () => {
    const shown = [toRecorderRow(entry({ id: 'r-3' }), 0), toRecorderRow(entry({ id: 'r-2' }), 0)];

    const rows = appendOlderRecorderRows(shown, [entry({ id: 'r-2' }), entry({ id: 'r-1' }), entry({ source: 'event', id: '9' })], 500);

    expect(rows.map((row) => row.key)).toEqual(['request:r-3', 'request:r-2', 'request:r-1', 'event:9']);
  });

  it('never grows past the cap', () => {
    const page = Array.from({ length: 120 }, (_unused, index) => entry({ id: `r-${index}` }));

    expect(appendOlderRecorderRows([], page, 100)).toHaveLength(100);
  });
});

describe('canLoadOlderRecorderRows', () => {
  it.each([
    { cursor: 'c', count: 499, isLoading: false, expected: true },
    { cursor: '', count: 10, isLoading: false, expected: false },
    { cursor: 'c', count: 500, isLoading: false, expected: false },
    { cursor: 'c', count: 10, isLoading: true, expected: false },
  ])('cursor "$cursor", $count rows, loading $isLoading → $expected', ({ cursor, count, isLoading, expected }) => {
    expect(canLoadOlderRecorderRows(cursor, count, isLoading, 500)).toBe(expected);
  });
});

describe('toRecorderLineModel', () => {
  it('words a request: route, status, duration and device', () => {
    const model = toRecorderLineModel(
      toRecorderRow(entry({ id: 'r-1', atMs: localMs(17, 31, 4), kind: 'http', route: 'POST /api/sync/reconcile', httpStatus: 500, outcome: 'error', durationMs: 41, deviceName: 'Pixel', errorCode: 'list_changes_failed' }), 0),
    );

    expect(model).toEqual({
      key: 'request:r-1',
      time: '17:31:04',
      title: 'POST /api/sync/reconcile',
      detail: 'Pixel · 41 ms · list_changes_failed',
      statusLabel: '500',
      statusColor: 'danger',
    });
  });

  it.each([
    { httpStatus: 404, outcome: 'ok', label: '404', color: 'warning' },
    { httpStatus: 200, outcome: 'ok', label: '200', color: 'default' },
    { httpStatus: 499, outcome: 'ok', label: '499', color: 'warning' },
    { httpStatus: 400, outcome: 'ok', label: '400', color: 'warning' },
    { httpStatus: 399, outcome: 'ok', label: '399', color: 'default' },
    { httpStatus: undefined, outcome: 'pending', label: 'pending', color: 'default' },
    { httpStatus: undefined, outcome: 'abandoned', label: 'abandoned', color: 'warning' },
  ])('colors a request answered $httpStatus/$outcome as $color', ({ httpStatus, outcome, label, color }) => {
    const model = toRecorderLineModel(toRecorderRow(entry({ id: 'r', httpStatus, outcome }), 0));

    expect(model.statusLabel).toBe(label);
    expect(model.statusColor).toBe(color);
  });

  it('falls back to the kind when a request has no route, and leaves an empty detail empty', () => {
    const model = toRecorderLineModel(toRecorderRow(entry({ kind: 'ws_connect', outcome: 'ok' }), 0));

    expect(model.title).toBe('ws_connect');
    expect(model.detail).toBe('');
  });

  it('words an event: its message, then domain, type and duration, colored by level', () => {
    const model = toRecorderLineModel(
      toRecorderRow(entry({ source: 'event', atMs: localMs(9, 5, 0), domain: 'download', level: 'error', eventType: 'download.failed', message: 'Hoster declared dead', durationMs: 1200 }), 2),
    );

    expect(model).toEqual({
      key: 'event:live:2',
      time: '09:05:00',
      title: 'Hoster declared dead',
      detail: 'download · download.failed · 1200 ms',
      statusLabel: 'error',
      statusColor: 'danger',
    });
  });

  it.each([
    { level: 'warn', color: 'warning' },
    { level: 'info', color: 'default' },
  ])('colors an event at level $level as $color', ({ level, color }) => {
    expect(toRecorderLineModel(toRecorderRow(entry({ source: 'event', level }), 0)).statusColor).toBe(color);
  });

  it('falls back to the event type when an event has no message', () => {
    expect(toRecorderLineModel(toRecorderRow(entry({ source: 'event', eventType: 'season.synced' }), 0)).title).toBe('season.synced');
  });
});
