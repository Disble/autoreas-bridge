import { describe, expect, it } from 'vitest';
import type { ActivityChangeContext, ActivityRequestDetail } from '../../activity-source/activity-incident.types';
import type { DrawerSummaryInput } from '../drawer.types';
import {
  pickDrawerTab,
  toDrawerCopyText,
  toDrawerDataBlocks,
  toDrawerEventRows,
  toDrawerEventsEmpty,
  toDrawerRequestGroups,
  toDrawerPickedRequestPanel,
  toDrawerRequestId,
  toDrawerRequestPanel,
  toDrawerTechnicalTabs,
  toDrawerWindowErrorDetail,
} from '../drawer-technical.helpers';
import { feedLine, incident } from './drawer.fixtures';

/** Builds a summary input with no reads. */
function input(overrides: Partial<DrawerSummaryInput>): DrawerSummaryInput {
  return { line: feedLine(), incident: undefined, story: undefined, change: undefined, changeFailed: false, metadata: undefined, nowMs: 0, ...overrides };
}

/** Change 872's context as stored: one sync event and the reconcile that carried it. */
const CHANGE: ActivityChangeContext = {
  events: [{ id: 40251, atMs: 3, domain: 'sync', level: 'info', eventType: 'sync.changelog', message: 'recorded pending changelog for 8Fn5qny6DPbhWLJn', correlationId: 'd4c0', durationMs: undefined, metadataJson: '' }],
  requests: [{ routeTemplate: '/api/sync/reconcile', httpStatus: 200, count: 1, firstAtMs: 1, lastAtMs: 1, latestRequestId: '7e4b8c9f', kind: 'reconcile', outcome: 'completed', maxDurationMs: 76, containsTrigger: false }],
};

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
  requestHeaders: { Authorization: 'Bearer ••••••••', 'X-Client-Request-Id': 'c6720086:3' },
  responseHeaders: { 'Content-Type': 'application/json' },
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

  it('folds a change context captures when there is no incident, and prefers the incident', () => {
    expect(toDrawerRequestGroups(undefined, CHANGE).map((group) => [group.route, group.status, group.latestRequestId])).toEqual([['/api/sync/reconcile', '200', '7e4b8c9f']]);
    expect(toDrawerRequestGroups(DETAIL, CHANGE).map((group) => group.latestRequestId)).toEqual(['r1', 'r2']);
  });
});

describe('toDrawerRequestPanel', () => {
  it('reads not applied from the stored response body and the cut chips from the body states', () => {
    const panel = toDrawerRequestPanel(toDrawerRequestGroups(DETAIL)[0]!, REQUEST);

    expect(panel).toMatchObject({ status: '200', failed: false, notApplied: true, requestCut: false, responseCut: true });
    expect(panel.summary).toEqual(['/api/sync/reconcile', '71 ms']);
    expect(panel.requestHeaders).toEqual([
      { name: 'Authorization', value: 'Bearer ••••••••' },
      { name: 'X-Client-Request-Id', value: 'c6720086:3' },
    ]);
    expect(panel.responseHeaders).toEqual([{ name: 'Content-Type', value: 'application/json' }]);
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

  it('lists a change line events as stored: message, domain and type', () => {
    const line = feedLine({ type: 'change', origin: 'phone' }, { kind: 'change', id: '872' });

    expect(toDrawerEventRows(input({ line, change: CHANGE })).map((row) => [row.key, row.level, row.message, row.domain, row.detail])).toEqual([
      ['40251', 'info', 'recorded pending changelog for 8Fn5qny6DPbhWLJn', 'sync', 'sync.changelog'],
    ]);
    expect(toDrawerEventsEmpty(input({ line, change: CHANGE }))).toBe('');
    expect(toDrawerEventsEmpty(input({ line, change: { ...CHANGE, events: [] } }))).toBe('No runtime events are linked to this line.');
    expect(toDrawerEventsEmpty(input({ line, changeFailed: true }))).toBe('The events linked to this change could not be read.');
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

  it('falls back to the line title when the report stored no message', () => {
    expect(toDrawerWindowErrorDetail(input({ line: LINE, metadata: { kind: 'error', occurredAtMs: 'x' } }))?.message).toBe('frontend render: boom');
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
    const request: ActivityRequestDetail = { ...REQUEST, httpStatus: undefined, durationMs: undefined, requestBody: undefined, requestBodyState: 'truncated', responseBody: undefined, responseBodyState: '', requestHeaders: undefined, responseHeaders: undefined };

    expect(toDrawerRequestPanel({ ...group, count: 1 }, request)).toEqual({
      summary: ['/api/sync/reconcile'],
      status: 'no answer',
      failed: false,
      notApplied: false,
      requestBody: '',
      requestCut: true,
      responseBody: '',
      responseCut: false,
      requestHeaders: [],
      responseHeaders: [],
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

describe('toDrawerEventRows of a run', () => {
  /** Two stored steps of run-1. */
  const STORY = {
    correlationId: 'run-1',
    truncated: false,
    steps: [
      { id: 1, atMs: 1, domain: 'download', level: 'info', eventType: 'download.run_started', message: 'started', correlationId: 'run-1', durationMs: undefined, metadataJson: '' },
      { id: 2, atMs: 2, domain: 'download', level: 'error', eventType: 'download.failed', message: 'list episodes failed', correlationId: 'run-1', durationMs: undefined, metadataJson: '' },
    ],
  };

  it('lists the run story steps, ahead of an incident window', () => {
    const line = feedLine({ run: undefined }, { kind: 'download_run', correlationId: 'run-1' });

    expect(toDrawerEventRows(input({ line, story: STORY, incident: DETAIL })).map((row) => [row.level, row.message, row.detail])).toEqual([
      ['info', 'started', 'download.run_started'],
      ['error', 'list episodes failed', 'download.failed'],
    ]);
  });

  it('falls back to the incident window when the story is empty', () => {
    const line = feedLine({}, { kind: 'download_run', correlationId: 'run-1' });

    expect(toDrawerEventRows(input({ line, story: { ...STORY, steps: [] }, incident: DETAIL })).map((row) => row.message)).toEqual(['Device session rejected']);
  });
});

describe('toDrawerEventsEmpty', () => {
  /** A run line. */
  const LINE = feedLine({}, { kind: 'download_run', correlationId: 'run-1' });

  it.each([
    ['a run whose read story is empty says so', { correlationId: 'run-1', steps: [], truncated: false }, undefined, 'No events were recorded for this run.'],
    ['a line with no story and no incident says no event is linked', undefined, undefined, 'No runtime events are linked to this line.'],
    ['an empty story with incident events says nothing', { correlationId: 'run-1', steps: [], truncated: false }, DETAIL, ''],
  ])('%s', (_name, story, detail, expected) => {
    expect(toDrawerEventsEmpty(input({ line: LINE, story, incident: detail }))).toBe(expected);
  });

  it.each([
    ['a phone change says no event is linked', feedLine({ origin: 'phone' }, { kind: 'change' }), 'No runtime events are linked to this line.'],
    ['an event line shows itself and says nothing', feedLine({}, { kind: 'event' }), ''],
  ])('%s', (_name, line, expected) => {
    expect(toDrawerEventsEmpty(input({ line }))).toBe(expected);
  });
});

describe('toDrawerRequestId', () => {
  it.each([
    ['the picked group latest on the open Requests tab', true, 'requests', 'r1'],
    ['nothing while the summary is shown', false, 'requests', undefined],
    ['nothing on another tab', true, 'events', undefined],
  ] as const)('reads %s', (_name, technical, tab, expected) => {
    expect(toDrawerRequestId(technical, tab, toDrawerRequestGroups(DETAIL)[0])).toBe(expected);
  });

  it('reads nothing without a group', () => {
    expect(toDrawerRequestId(true, 'requests', undefined)).toBeUndefined();
  });
});

describe('toDrawerPickedRequestPanel', () => {
  it('builds the panel once the group and its request are known', () => {
    const group = toDrawerRequestGroups(DETAIL)[0];

    expect(toDrawerPickedRequestPanel(group, REQUEST)).toEqual(toDrawerRequestPanel(group!, REQUEST));
  });

  it.each([
    ['the request is not read', 'group'],
    ['there is no group', 'request'],
  ] as const)('builds nothing while %s', (_name, known) => {
    const group = known === 'group' ? toDrawerRequestGroups(DETAIL)[0] : undefined;

    expect(toDrawerPickedRequestPanel(group, known === 'request' ? REQUEST : undefined)).toBeUndefined();
  });
});
