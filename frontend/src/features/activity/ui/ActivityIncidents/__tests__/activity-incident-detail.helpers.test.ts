import { describe, expect, it, vi } from 'vitest';
import type { ActivityFoldedRequest, ActivityIncidentDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import {
  findActivityIncidentRunId,
  readActivityIncident,
  toActivityIncidentCopyText,
  toActivityIncidentDetailModel,
  toActivityIncidentLanes,
  toActivityRequestRows,
} from '../activity-incident-detail.helpers';

/** Local epoch milliseconds of Oct 17 at the given time. */
function at(hours: number, minutes: number, seconds = 0, ms = 0): number {
  return new Date(2026, 9, 17, hours, minutes, seconds, ms).getTime();
}

/** The incident moment every case uses. */
const OCCURRED = at(17, 31, 0);

/** One folded request with defaults. */
function folded(overrides: Partial<ActivityFoldedRequest>): ActivityFoldedRequest {
  return {
    routeTemplate: '/api/sync/reconcile',
    httpStatus: 200,
    count: 1,
    firstAtMs: OCCURRED,
    lastAtMs: OCCURRED,
    latestRequestId: 'req-1',
    kind: 'http',
    outcome: 'completed',
    maxDurationMs: 41,
    containsTrigger: false,
    ...overrides,
  };
}

/** A request incident: window −2 min to +30 s, every lane filled. */
function detail(overrides: Partial<ActivityIncidentDetail> = {}): ActivityIncidentDetail {
  return {
    incident: {
      id: 42,
      fingerprint: 'fp',
      reason: 'http_5xx',
      title: 'Sync failed for 5 requests',
      occurredAtMs: OCCURRED,
      windowStartMs: OCCURRED - 120_000,
      windowEndMs: OCCURRED + 30_000,
      sourceKind: 'request',
      sourceId: 'req-9',
    },
    cause: { known: true, errorCode: 'list_changes_failed', message: 'database is locked' },
    requests: [folded({ httpStatus: 500, count: 5, firstAtMs: OCCURRED - 60_000, latestRequestId: 'req-9', containsTrigger: true })],
    events: [{ id: 7, atMs: OCCURRED - 120_000, domain: 'sync', level: 'warn', eventType: 'sync.slow', message: 'slow', correlationId: '' }],
    phoneReports: [{ id: 3, atMs: OCCURRED + 30_000, phoneAtMs: undefined, deviceId: 'd', kind: 'cycle_report', outcome: 'failed' }],
    earlier: [],
    expiresAtMs: at(23, 59),
    ...overrides,
  };
}

describe('activity-incident-detail.helpers', () => {
  it('draws the window as three lanes on one axis, failures marked and the trigger flagged', () => {
    expect(toActivityIncidentLanes(detail())).toEqual({
      lanes: [
        { label: 'Phone', markers: [{ key: 'phone-3', leftPercent: 100, tone: 'danger', isTrigger: false, title: '17:31:30.000 · cycle_report · failed' }] },
        {
          label: 'Requests',
          markers: [
            { key: 'request-req-9-first', leftPercent: 40, tone: 'danger', isTrigger: true, title: '17:30:00.000 · /api/sync/reconcile · 500 · ×5' },
            { key: 'request-req-9-last', leftPercent: 80, tone: 'danger', isTrigger: true, title: '17:31:00.000 · /api/sync/reconcile · 500 · ×5' },
          ],
        },
        { label: 'Bridge', markers: [{ key: 'event-7', leftPercent: 0, tone: 'warning', isTrigger: false, title: '17:29:00.000 · slow' }] },
      ],
      occurredPercent: 80,
      startLabel: '−2 min',
      endLabel: '+30 s',
      summary: 'Window from 17:29:00.000 to 17:31:30.000: 1 phone report (1 failed), 5 requests (5 failed), 1 bridge event (1 warning).',
    });
  });

  it('draws a single request once, a 4xx as a warning, a rejected one as a failure, and an error event as the internal trigger', () => {
    const lanes = toActivityIncidentLanes(
      detail({
        incident: { ...detail().incident, sourceKind: 'event', sourceId: '7' },
        requests: [
          folded({ httpStatus: 400, latestRequestId: 'a' }),
          folded({ httpStatus: undefined, outcome: 'rejected', latestRequestId: 'b' }),
          folded({ latestRequestId: 'c', firstAtMs: OCCURRED - 1_000 }),
          folded({ latestRequestId: 'd', count: 3 }),
        ],
        events: [
          { id: 7, atMs: OCCURRED, domain: 'download', level: 'error', eventType: 'download.failed', message: 'dead', correlationId: 'dl-1' },
          { id: 8, atMs: OCCURRED, domain: 'download', level: 'info', eventType: 'download.retry', message: 'retry', correlationId: 'dl-1' },
        ],
        phoneReports: [
          { id: 3, atMs: OCCURRED, phoneAtMs: undefined, deviceId: 'd', kind: 'cycle_report', outcome: 'ok' },
          { id: 4, atMs: OCCURRED, phoneAtMs: undefined, deviceId: 'd', kind: 'heartbeat', outcome: '' },
        ],
      }),
    );

    expect(lanes.lanes[1].markers.map((marker) => [marker.key, marker.tone, marker.title])).toEqual([
      ['request-a-last', 'warning', '17:31:00.000 · /api/sync/reconcile · 400'],
      ['request-b-last', 'danger', '17:31:00.000 · /api/sync/reconcile · rejected'],
      ['request-c-last', 'default', '17:31:00.000 · /api/sync/reconcile · 200'],
      ['request-d-last', 'default', '17:31:00.000 · /api/sync/reconcile · 200 · ×3'],
    ]);
    expect(lanes.lanes[2].markers.map((marker) => [marker.tone, marker.isTrigger])).toEqual([
      ['danger', true],
      ['default', false],
    ]);
    expect(lanes.lanes[0].markers.map((marker) => [marker.tone, marker.title])).toEqual([
      ['default', '17:31:00.000 · cycle_report · ok'],
      ['default', '17:31:00.000 · heartbeat'],
    ]);
    expect(lanes.summary).toBe('Window from 17:29:00.000 to 17:31:30.000: 2 phone reports, 6 requests (2 failed), 2 bridge events (1 error).');
  });

  it('never flags an event of a request incident as the trigger, and counts several errors or warnings', () => {
    const error = { id: 7, atMs: OCCURRED, domain: 'sync', level: 'error', eventType: 'e', message: 'm', correlationId: '' };
    const sameIdAsSource = toActivityIncidentLanes(detail({ incident: { ...detail().incident, sourceId: '7' }, events: [error] }));
    const errors = toActivityIncidentLanes(detail({ events: [error, { ...error, id: 8 }] }));
    const warnings = toActivityIncidentLanes(detail({ events: [{ ...error, level: 'warn' }, { ...error, id: 8, level: 'warn' }] }));

    expect(sameIdAsSource.lanes[2].markers[0].isTrigger).toBe(false);
    expect(errors.summary).toMatch(/, 2 bridge events \(2 errors\)\.$/);
    expect(warnings.summary).toMatch(/, 2 bridge events \(2 warnings\)\.$/);
  });

  it('keeps markers inside the axis and centers everything on an empty window', () => {
    const outside = toActivityIncidentLanes(detail({ events: [{ id: 1, atMs: OCCURRED - 999_000, domain: 'd', level: 'info', eventType: 'e', message: 'm', correlationId: '' }] }));
    const empty = toActivityIncidentLanes(
      detail({ incident: { ...detail().incident, windowStartMs: OCCURRED, windowEndMs: OCCURRED }, requests: [], events: [], phoneReports: [] }),
    );

    expect(outside.lanes[2].markers[0]).toMatchObject({ leftPercent: 0, tone: 'default' });
    expect(outside.summary).toBe('Window from 17:29:00.000 to 17:31:30.000: 1 phone report (1 failed), 5 requests (5 failed), 1 bridge event.');
    expect(empty.occurredPercent).toBe(50);
    expect(empty.summary).toBe('Window from 17:31:00.000 to 17:31:00.000: no phone report, no request, no bridge event.');
  });

  it('words the folded request rows for the table', () => {
    expect(
      toActivityRequestRows([
        folded({ httpStatus: 500, count: 5, latestRequestId: 'req-9', lastAtMs: at(17, 31, 4, 120), containsTrigger: true }),
        folded({ httpStatus: 404, maxDurationMs: undefined, latestRequestId: 'r2' }),
        folded({ httpStatus: undefined, routeTemplate: '/ws', latestRequestId: 'r3', maxDurationMs: 2_500 }),
      ]),
    ).toEqual([
      { requestId: 'req-9', time: '17:31:04.120', route: '/api/sync/reconcile', countLabel: '×5', status: '500', statusTone: 'danger', duration: '41 ms', isTrigger: true },
      { requestId: 'r2', time: '17:31:00.000', route: '/api/sync/reconcile', countLabel: '', status: '404', statusTone: 'warning', duration: '—', isTrigger: false },
      { requestId: 'r3', time: '17:31:00.000', route: '/ws', countLabel: '', status: '—', statusTone: 'default', duration: '2.5 s', isTrigger: false },
    ]);
  });

  it('finds the run an internal incident opens, and none for any other source', () => {
    const internal = detail({
      incident: { ...detail().incident, sourceKind: 'event', sourceId: '7' },
      events: [
        { id: 6, atMs: 0, domain: 'download', level: 'info', eventType: 'e', message: 'm', correlationId: 'other' },
        { id: 7, atMs: 0, domain: 'download', level: 'error', eventType: 'e', message: 'm', correlationId: 'dl-1' },
      ],
    });

    expect(findActivityIncidentRunId(internal)).toBe('dl-1');
    expect(findActivityIncidentRunId(detail())).toBeUndefined();
    expect(findActivityIncidentRunId(detail({ incident: { ...internal.incident, sourceKind: 'request' }, events: internal.events }))).toBeUndefined();
    expect(findActivityIncidentRunId(detail({ incident: { ...internal.incident }, events: [{ ...internal.events[1], correlationId: '' }] }))).toBeUndefined();
    expect(findActivityIncidentRunId(detail({ incident: { ...internal.incident, sourceId: '99' }, events: internal.events }))).toBeUndefined();
  });

  it('copies an MCP-ready get_incident reference', () => {
    expect(toActivityIncidentCopyText(detail().incident)).toBe('Use the autoreas-request-mcp tool get_incident with {"id":42}.\nIncident: Sync failed for 5 requests, Oct 17, 17:31.');
  });

  it('words the whole occurrence for the detail pane', () => {
    const model = toActivityIncidentDetailModel(detail({ earlier: [{ id: 40, occurredAtMs: at(9, 5) }, { id: 39, occurredAtMs: at(8, 0) }] }));

    expect(model).toEqual({
      title: 'Sync failed for 5 requests',
      span: 'Oct 17, 17:29 → 17:31:30',
      chips: [
        { label: 'From a request', color: 'default' },
        { label: 'http 5xx', color: 'default' },
      ],
      cause: { code: 'list_changes_failed', message: 'database is locked' },
      lanes: toActivityIncidentLanes(detail()),
      requests: toActivityRequestRows(detail().requests),
      earlierLine: 'Happened 2 times before, last on Oct 17, 09:05.',
      expiryLine: 'Kept until Oct 17, 23:59.',
      copyText: toActivityIncidentCopyText(detail().incident),
      runCorrelationId: undefined,
    });
  });

  it('words an unknown cause, an unknown source, a first occurrence and a single earlier one', () => {
    const first = toActivityIncidentDetailModel(detail({ cause: { known: false, errorCode: '', message: '' }, incident: { ...detail().incident, sourceKind: 'other' } }));
    const once = toActivityIncidentDetailModel(detail({ earlier: [{ id: 40, occurredAtMs: at(9, 5) }] }));

    expect(first.cause).toBeUndefined();
    expect(first.chips[0]).toEqual({ label: 'other', color: 'default' });
    expect(first.earlierLine).toBe('No earlier occurrence is kept.');
    expect(once.earlierLine).toBe('Happened once before, on Oct 17, 09:05.');
  });
});

describe('readActivityIncident', () => {
  it('reads one incident by its id, gone once it is no longer stored', async () => {
    const found = detail();
    const getIncident = vi.fn((id: number) => Promise.resolve(id === 42 ? found : undefined));
    const source = { getIncident } as unknown as ActivitySource;
    await expect(readActivityIncident(source, 42)).resolves.toEqual({ status: 'ready', value: found });
    await expect(readActivityIncident(source, 7)).resolves.toEqual({ status: 'gone' });
  });
});
