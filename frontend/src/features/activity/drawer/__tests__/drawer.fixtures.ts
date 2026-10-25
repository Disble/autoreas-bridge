import type { ActivityIncidentDetail } from '../../activity-source/activity-incident.types';
import type { ActivityFeedLine } from '../../feed-source/feed.types';
import type { ActivityLedgerLine } from '../../history-source/history.types';

/** A ledger line with every field empty, overridden per test. */
function ledgerLine(overrides: Partial<ActivityLedgerLine> = {}): ActivityLedgerLine {
  return {
    kind: 'event',
    id: '1',
    atMs: Date.UTC(2026, 9, 22, 12, 0),
    phoneAtMs: undefined,
    domain: '',
    source: '',
    level: '',
    title: '',
    detail: '',
    correlationId: '',
    beforeJson: '',
    afterJson: '',
    marks: [],
    ...overrides,
  };
}

/** A feed line of the given kind, overridden per test. */
export function feedLine(overrides: Partial<ActivityFeedLine> = {}, line: Partial<ActivityLedgerLine> = {}): ActivityFeedLine {
  return {
    type: 'system',
    origin: 'bridge',
    failed: false,
    slow: false,
    incidentId: undefined,
    traffic: undefined,
    run: undefined,
    system: undefined,
    ...overrides,
    line: ledgerLine(line),
  };
}

/** An incident occurrence with no requests or events, overridden per test. */
export function incident(overrides: Partial<ActivityIncidentDetail> = {}): ActivityIncidentDetail {
  return {
    incident: {
      id: 7,
      fingerprint: 'fp',
      reason: 'http_4xx',
      title: 'Sync refused',
      occurredAtMs: Date.UTC(2026, 9, 22, 12, 14),
      windowStartMs: 0,
      windowEndMs: 0,
      sourceKind: 'request',
      sourceId: 'req-1',
    },
    cause: { known: true, errorCode: '', message: 'invalid bearer token' },
    requests: [],
    events: [],
    phoneReports: [],
    earlier: [],
    expiresAtMs: Date.UTC(2027, 0, 20, 12, 0),
    ...overrides,
  };
}

/** A failed run with no trigger and no end, overridden per row. */
export function run(overrides: Partial<NonNullable<ActivityFeedLine['run']>> = {}): NonNullable<ActivityFeedLine['run']> {
  return {
    runId: 'run-1',
    trigger: '',
    status: 'error',
    startedAtMs: Date.UTC(2026, 9, 22, 12, 0),
    finishedAtMs: undefined,
    animesChecked: 1,
    episodesFound: 1,
    episodesDownloaded: 0,
    episodesFailed: 1,
    skippedCount: 0,
    upToDateCount: 0,
    errorSummary: 'host down',
    ...overrides,
  };
}
