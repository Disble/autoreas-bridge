import { describe, expect, it } from 'vitest';
import type { ActivityRequestDetail } from '../../activity-source/activity-incident.types';
import type { DrawerSummaryInput } from '../drawer.types';
import {
  pickDrawerTab,
  toDrawerCopyText,
  toDrawerDataBlocks,
  toDrawerEventRows,
  toDrawerRequestGroups,
  toDrawerRequestPanel,
  toDrawerTechnicalTabs,
  toDrawerWindowErrorDetail,
} from '../drawer-technical.helpers';
import { feedLine, incident } from './drawer.fixtures';

/** Builds a summary input with no reads. */
function input(overrides: Partial<DrawerSummaryInput>): DrawerSummaryInput {
  return { line: feedLine(), incident: undefined, metadata: undefined, nowMs: 0, ...overrides };
}

/** Two folded groups: a refused one and a fine one. */
const DETAIL = incident({
  requests: [
    { routeTemplate: '/api/sync/reconcile', httpStatus: 401, count: 1, firstAtMs: 1, lastAtMs: 1, latestRequestId: 'r1', kind: 'http', outcome: 'x', maxDurationMs: 38, containsTrigger: true },
    { routeTemplate: '/api/sync/diagnostics', httpStatus: undefined, count: 3, firstAtMs: 1, lastAtMs: 2, latestRequestId: 'r2', kind: 'http', outcome: 'x', maxDurationMs: undefined, containsTrigger: false },
  ],
  events: [{ id: 5, atMs: 3, domain: 'auth', level: 'warn', eventType: 'auth.rejected', message: 'Device session rejected', correlationId: '' }],
});

/** A captured reconcile whose response refused one operation. */
const REQUEST: ActivityRequestDetail = {
  requestId: 'r1',
  capturedAtMs: 1,
  kind: 'http',
  route: '/api/sync/reconcile',
  transport: 'http',
  outcome: 'x',
  errorCode: '',
  httpStatus: 200,
  durationMs: 71,
  requestBody: '{"pending_operations":[]}',
  requestBodyState: '',
  responseBody: '{"applied_operations":[{"applied":false,"reason":"conflict"}]}',
  responseBodyState: 'truncated',
  deviceName: 'Pixel',
};

describe('toDrawerTechnicalTabs', () => {
  it.each([
    ['phone', ['requests', 'events', 'data']],
    ['bridge', ['events', 'data']],
  ] as const)('a %s line shows %j', (origin, tabs) => {
    expect(toDrawerTechnicalTabs(feedLine({ origin }))).toEqual(tabs);
  });
});

describe('pickDrawerTab', () => {
  it('keeps the chosen tab when the line has it and falls back to the first otherwise', () => {
    expect(pickDrawerTab(['requests', 'events', 'data'], 'data')).toBe('data');
    expect(pickDrawerTab(['events', 'data'], 'requests')).toBe('events');
  });
});

describe('toDrawerRequestGroups', () => {
  it('folds the incident requests by route and status, a missing status reading as no answer', () => {
    expect(toDrawerRequestGroups(DETAIL).map((group) => [group.route, group.status, group.failed, group.count])).toEqual([
      ['/api/sync/reconcile', '401', true, 1],
      ['/api/sync/diagnostics', 'no answer', false, 3],
    ]);
  });

  it('is empty without an incident', () => {
    expect(toDrawerRequestGroups(undefined)).toEqual([]);
  });
});

describe('toDrawerRequestPanel', () => {
  it('reads not applied from the stored response body and the cut chips from the body states', () => {
    const panel = toDrawerRequestPanel(toDrawerRequestGroups(DETAIL)[0]!, REQUEST);

    expect(panel).toMatchObject({ status: '200', failed: false, notApplied: true, requestCut: false, responseCut: true });
    expect(panel.summary).toEqual(['/api/sync/reconcile', '71 ms']);
  });

  it('says latest of N only when the group folds several requests', () => {
    const group = toDrawerRequestGroups(DETAIL)[1]!;

    expect(toDrawerRequestPanel(group, { ...REQUEST, responseBody: '{}' }).summary).toContain(`latest of 3 · ${group.latestTime}`);
    expect(toDrawerRequestPanel(group, { ...REQUEST, responseBody: 'not json' }).notApplied).toBe(false);
  });
});

describe('toDrawerEventRows', () => {
  it('lists the incident window events', () => {
    expect(toDrawerEventRows(input({ incident: DETAIL })).map((row) => [row.level, row.message, row.domain, row.detail])).toEqual([
      ['warn', 'Device session rejected', 'auth', 'auth.rejected'],
    ]);
  });

  it('shows an event line itself when no incident was read, and nothing for other kinds', () => {
    const event = feedLine({}, { kind: 'event', level: 'info', title: 'Bridge started', domain: 'api', detail: 'api.listening' });

    expect(toDrawerEventRows(input({ line: event })).map((row) => row.message)).toEqual(['Bridge started']);
    expect(toDrawerEventRows(input({ line: feedLine({}, { kind: 'change' }) }))).toEqual([]);
  });
});

describe('toDrawerDataBlocks', () => {
  it('shows a change as its stored before and after snapshots', () => {
    const line = feedLine({ type: 'change' }, { kind: 'change', beforeJson: '{"a":1}', afterJson: '{"a":2}' });

    expect(toDrawerDataBlocks(input({ line }))).toEqual([
      { label: 'Before', raw: '{"a":1}' },
      { label: 'After', raw: '{"a":2}' },
    ]);
  });

  it('shows a traffic hour, a run, and an event with its recorded metadata', () => {
    const traffic = { hourStartMs: 1, requests: 2, failed: 0, maxDurationMs: 3 };

    expect(toDrawerDataBlocks(input({ line: feedLine({ traffic }, { kind: 'traffic_hour' }) }))[0]).toEqual({ label: 'Hourly total', raw: JSON.stringify(traffic) });
    const event = toDrawerDataBlocks(input({ line: feedLine({}, { kind: 'event', detail: 'x.y' }), metadata: { k: 'v' } }));
    expect(event.map((block) => block.label)).toEqual(['Event', 'Recorded fields']);
    expect(JSON.parse(event[1]!.raw)).toEqual({ k: 'v' });
  });
});

describe('toDrawerCopyText', () => {
  it('copies the reference in the summary and adds the data in the technical view', () => {
    const line = feedLine({ incidentId: 7 }, { kind: 'event', id: '12', correlationId: 'c-1', detail: 'x.y' });

    const summary = toDrawerCopyText(input({ line }), false);
    const technical = toDrawerCopyText(input({ line }), true);

    expect(summary).toContain('incident 7');
    expect(summary).toContain('correlation c-1');
    expect(summary).not.toContain('"kind"');
    expect(technical).toContain('"kind"');
  });

  it('copies a bare line as its reference only, without incident or correlation', () => {
    const text = toDrawerCopyText(input({ line: feedLine({}, { kind: 'phone_report', id: '3' }) }), false);

    expect(text).not.toContain('incident');
    expect(text).not.toContain('correlation');
    expect(text).toContain('phone_report 3');
  });
});

describe('toDrawerWindowErrorDetail', () => {
  /** A window error line. */
  const LINE = feedLine({ failed: true }, { kind: 'event', detail: 'frontend.error', title: 'frontend render: boom' });

  it('shows every stored field of a window error, the stack as stored', () => {
    const metadata = { kind: 'render', route: '/editor', source: 'assets/index.js:1:2', message: 'boom', stack: 'at A', occurredAtMs: String(Date.UTC(2026, 9, 22, 12)) };

    const detail = toDrawerWindowErrorDetail(input({ line: LINE, metadata }));

    expect(detail?.facts.map((fact) => [fact.label, fact.value])).toEqual([
      ['Kind', 'render'],
      ['Page', '/editor'],
      ['Source', 'assets/index.js:1:2'],
      ['At', expect.stringMatching(/^\d\d:\d\d:\d\d$/)],
    ]);
    expect(detail).toMatchObject({ message: 'boom', stack: 'at A' });
  });

  it('leaves out fields the report did not store and falls back to the event message', () => {
    expect(toDrawerWindowErrorDetail(input({ line: LINE, metadata: { kind: 'error', occurredAtMs: 'x' } }))).toEqual({
      facts: [{ key: 'kind', label: 'Kind', value: 'error', mono: true, warnChip: undefined }],
      message: 'frontend render: boom',
      stack: '',
    });
  });

  it.each([
    ['another event type', feedLine({}, { kind: 'event', detail: 'x.y' }), { kind: 'render' }],
    ['no metadata', LINE, undefined],
  ])('is undefined for %s', (_name, line, metadata) => {
    expect(toDrawerWindowErrorDetail(input({ line, metadata }))).toBeUndefined();
  });
});

describe('technical edge cases', () => {
  it('words an unanswered request without duration or bodies', () => {
    const group = toDrawerRequestGroups(DETAIL)[1]!;
    const request: ActivityRequestDetail = { ...REQUEST, httpStatus: undefined, durationMs: undefined, requestBody: undefined, requestBodyState: 'truncated', responseBody: undefined, responseBodyState: '' };

    expect(toDrawerRequestPanel({ ...group, count: 1 }, request)).toEqual({
      summary: ['/api/sync/reconcile'],
      status: 'no answer',
      failed: false,
      notApplied: false,
      requestBody: '',
      requestCut: true,
      responseBody: '',
      responseCut: false,
    });
  });

  it.each([
    ['every operation applied', '{"applied_operations":[{"applied":true}]}', false],
    ['no operations list', '{"applied_operations":"x"}', false],
    ['a refused 4xx', '{"error":"invalid bearer token"}', false],
  ])('reads not applied as false when %s', (_name, responseBody, notApplied) => {
    expect(toDrawerRequestPanel(toDrawerRequestGroups(DETAIL)[0]!, { ...REQUEST, httpStatus: 401, responseBody })).toMatchObject({ notApplied, failed: true });
  });

  it('shows a run as its stored row and a line of another kind as itself', () => {
    const run = { runId: 'r', trigger: '', status: 'ok', startedAtMs: 1, finishedAtMs: undefined, animesChecked: 0, episodesFound: 0, episodesDownloaded: 0, episodesFailed: 0, skippedCount: 0, upToDateCount: 0, errorSummary: '' };

    expect(toDrawerDataBlocks(input({ line: feedLine({ run }, { kind: 'download_run' }) }))).toEqual([{ label: 'Run', raw: JSON.stringify(run) }]);
    expect(toDrawerDataBlocks(input({ line: feedLine({}, { kind: 'phone_report' }) })).map((block) => block.label)).toEqual(['Line']);
  });
});
