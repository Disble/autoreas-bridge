import { describe, expect, it, vi } from 'vitest';
import type { ActivityFoldedRequest, ActivityIncidentDetail } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { readActivityIncident } from '../activity-incident-detail.helpers';

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

describe('readActivityIncident', () => {
  it('reads one incident by its id, gone once it is no longer stored', async () => {
    const found = detail();
    const getIncident = vi.fn((id: number) => Promise.resolve(id === 42 ? found : undefined));
    const source = { getIncident } as unknown as ActivitySource;
    await expect(readActivityIncident(source, 42)).resolves.toEqual({ status: 'ready', value: found });
    await expect(readActivityIncident(source, 7)).resolves.toEqual({ status: 'gone' });
  });
});
