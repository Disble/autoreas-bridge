import { describe, expect, it } from 'vitest';
import { activityread, contracts, desktop } from '../../../../../wailsjs/go/models';
import {
  mapActivityIncidentResult,
  mapActivityRequestResult,
  mapActivityRun,
  mapActivityRunStory,
} from '../activity-incident.helpers';

/** A Go IncidentDetail payload as Wails hands it over, every list filled. */
function goIncidentDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Incident: {
      ID: 42,
      Fingerprint: 'fp-1',
      Reason: 'http_5xx',
      Title: 'Sync failed for 5 requests',
      OccurredAtMS: 1_000_000,
      WindowStartMS: 880_000,
      WindowEndMS: 1_030_000,
      SourceKind: 'request',
      SourceID: 'req-9',
    },
    Cause: { Known: true, ErrorCode: 'list_changes_failed', Message: 'database is locked' },
    Requests: [
      {
        RouteTemplate: '/api/sync/reconcile',
        HTTPStatus: 500,
        Count: 5,
        FirstAtMS: 990_000,
        LastAtMS: 1_000_000,
        LatestRequestID: 'req-9',
        Kind: 'http',
        Outcome: 'completed',
        MaxDurationMS: 41,
        ContainsTrigger: true,
      },
      { RouteTemplate: '/ws', HTTPStatus: null, Count: 1, FirstAtMS: 900_000, LastAtMS: 900_000, LatestRequestID: 'ws-1', Kind: 'ws', Outcome: 'opened', MaxDurationMS: null, ContainsTrigger: false },
    ],
    Events: [{ ID: 7, AtMS: 995_000, Domain: 'sync', Level: 'error', EventType: 'sync.failed', Message: 'm', CorrelationID: 'c-1' }],
    PhoneReports: [
      { ID: 3, AtMS: 999_000, PhoneAtMS: 998_000, DeviceID: 'd-1', Kind: 'cycle_report', Outcome: 'failed' },
      { ID: 4, AtMS: 999_500, PhoneAtMS: null, DeviceID: 'd-1', Kind: 'episode_action', Outcome: '' },
    ],
    Earlier: [{ ID: 40, OccurredAtMS: 500_000 }],
    ExpiresAtMS: 9_000_000,
    ...overrides,
  };
}

describe('activity-incident.helpers', () => {
  it('maps a found Go incident onto the readonly camelCase contract', () => {
    const result = desktop.ActivityIncidentResult.createFrom({ found: true, detail: goIncidentDetail() });

    expect(mapActivityIncidentResult(result)).toEqual({
      incident: {
        id: 42,
        fingerprint: 'fp-1',
        reason: 'http_5xx',
        title: 'Sync failed for 5 requests',
        occurredAtMs: 1_000_000,
        windowStartMs: 880_000,
        windowEndMs: 1_030_000,
        sourceKind: 'request',
        sourceId: 'req-9',
      },
      cause: { known: true, errorCode: 'list_changes_failed', message: 'database is locked' },
      requests: [
        {
          routeTemplate: '/api/sync/reconcile',
          httpStatus: 500,
          count: 5,
          firstAtMs: 990_000,
          lastAtMs: 1_000_000,
          latestRequestId: 'req-9',
          kind: 'http',
          outcome: 'completed',
          maxDurationMs: 41,
          containsTrigger: true,
        },
        {
          routeTemplate: '/ws',
          httpStatus: undefined,
          count: 1,
          firstAtMs: 900_000,
          lastAtMs: 900_000,
          latestRequestId: 'ws-1',
          kind: 'ws',
          outcome: 'opened',
          maxDurationMs: undefined,
          containsTrigger: false,
        },
      ],
      events: [{ id: 7, atMs: 995_000, domain: 'sync', level: 'error', eventType: 'sync.failed', message: 'm', correlationId: 'c-1' }],
      phoneReports: [
        { id: 3, atMs: 999_000, phoneAtMs: 998_000, deviceId: 'd-1', kind: 'cycle_report', outcome: 'failed' },
        { id: 4, atMs: 999_500, phoneAtMs: undefined, deviceId: 'd-1', kind: 'episode_action', outcome: '' },
      ],
      earlier: [{ id: 40, occurredAtMs: 500_000 }],
      expiresAtMs: 9_000_000,
    });
  });

  it('turns the nil lists of a found incident into empty arrays', () => {
    const result = desktop.ActivityIncidentResult.createFrom({
      found: true,
      detail: goIncidentDetail({ Requests: null, Events: null, PhoneReports: null, Earlier: null }),
    });

    const detail = mapActivityIncidentResult(result);

    expect(detail?.requests).toEqual([]);
    expect(detail?.events).toEqual([]);
    expect(detail?.phoneReports).toEqual([]);
    expect(detail?.earlier).toEqual([]);
  });

  it('reads an incident that is no longer stored as undefined, not as a failure', () => {
    expect(mapActivityIncidentResult(desktop.ActivityIncidentResult.createFrom({ found: false, detail: goIncidentDetail() }))).toBeUndefined();
  });

  it('maps a found captured request and its missing optional fields', () => {
    const full = desktop.ActivityRequestResult.createFrom({
      found: true,
      detail: {
        requestId: 'req-9',
        capturedAtMs: 1_000_000,
        kind: 'http',
        route: '/api/sync/reconcile',
        transport: 'http',
        outcome: 'completed',
        errorCode: 'list_changes_failed',
        httpStatus: 500,
        durationMs: 41,
        payload: {},
        requestBody: '{"a":1}',
        requestBodyState: '',
        responseBody: '{"error":"x"}',
        responseBodyState: 'truncated',
        correlations: {},
        deviceId: 'd-1',
        deviceName: 'Pixel',
      },
    });
    const bare = desktop.ActivityRequestResult.createFrom({
      found: true,
      detail: contracts.CaptureDetail.createFrom({ requestId: 'r', capturedAtMs: 1, kind: 'k', route: '/r', transport: 'ws', outcome: 'o', deviceName: '' }),
    });

    expect(mapActivityRequestResult(full)).toEqual({
      requestId: 'req-9',
      capturedAtMs: 1_000_000,
      kind: 'http',
      route: '/api/sync/reconcile',
      transport: 'http',
      outcome: 'completed',
      errorCode: 'list_changes_failed',
      httpStatus: 500,
      durationMs: 41,
      requestBody: '{"a":1}',
      requestBodyState: '',
      responseBody: '{"error":"x"}',
      responseBodyState: 'truncated',
      deviceName: 'Pixel',
    });
    expect(mapActivityRequestResult(bare)).toEqual({
      requestId: 'r',
      capturedAtMs: 1,
      kind: 'k',
      route: '/r',
      transport: 'ws',
      outcome: 'o',
      errorCode: '',
      httpStatus: undefined,
      durationMs: undefined,
      requestBody: undefined,
      requestBodyState: '',
      responseBody: undefined,
      responseBodyState: '',
      deviceName: '',
    });
  });

  it('reads a request that is no longer stored as undefined', () => {
    expect(mapActivityRequestResult(desktop.ActivityRequestResult.createFrom({ found: false, detail: {} }))).toBeUndefined();
  });

  it('maps a run', () => {
    const run = activityread.Run.createFrom({
      CorrelationID: 'c-1',
      FirstAtMS: 1,
      LastAtMS: 9,
      Steps: 4,
      Outcome: 'warn',
      FirstEventType: 'download.started',
      FirstMessage: 'Download started',
    });

    expect(mapActivityRun(run)).toEqual({
      correlationId: 'c-1',
      firstAtMs: 1,
      lastAtMs: 9,
      steps: 4,
      outcome: 'warn',
      firstEventType: 'download.started',
      firstMessage: 'Download started',
    });
  });

  it('maps a run story with its flattened steps, and a nil step list as empty', () => {
    const story = activityread.RunStory.createFrom({
      CorrelationID: 'c-1',
      Truncated: true,
      Steps: [
        { ID: 1, AtMS: 10, Domain: 'download', Level: 'info', EventType: 'download.started', Message: 'go', CorrelationID: 'c-1', DurationMS: 12, MetadataJSON: '{"a":1}' },
        { ID: 2, AtMS: 20, Domain: 'download', Level: 'warn', EventType: 'download.retry', Message: 'again', CorrelationID: 'c-1', DurationMS: null, MetadataJSON: '' },
      ],
    });

    expect(mapActivityRunStory(story)).toEqual({
      correlationId: 'c-1',
      truncated: true,
      steps: [
        { id: 1, atMs: 10, domain: 'download', level: 'info', eventType: 'download.started', message: 'go', correlationId: 'c-1', durationMs: 12, metadataJson: '{"a":1}' },
        { id: 2, atMs: 20, domain: 'download', level: 'warn', eventType: 'download.retry', message: 'again', correlationId: 'c-1', durationMs: undefined, metadataJson: '' },
      ],
    });
    expect(mapActivityRunStory(activityread.RunStory.createFrom({ CorrelationID: 'c', Steps: null, Truncated: false })).steps).toEqual([]);
  });
});
