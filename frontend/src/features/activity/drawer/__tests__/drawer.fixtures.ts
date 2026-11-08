import type { ActivityIncidentDetail } from '../../activity-source/activity-incident.types';
import type { ActivityFeedLine, ActivitySyncEvidence, ActivitySyncReading, ActivityTabletSummary } from '../../feed-source/feed.types';
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
    syncReading: undefined,
    bridgeOff: undefined,
    report: undefined,
    tabletSummaries: [],
    bridgeStart: undefined,
    ...overrides,
    line: ledgerLine(line),
  };
}

/** A reading of report 41 with only its two required times, overridden per test. */
export function syncReading(overrides: Partial<ActivitySyncReading> = {}, evidence: Partial<ActivitySyncEvidence> = {}): ActivitySyncReading {
  return {
    reportId: 41,
    reading: 'real_failure',
    ...overrides,
    evidence: {
      failedAtMs: Date.UTC(2026, 9, 22, 9, 0),
      arrivedAtMs: Date.UTC(2026, 9, 22, 12, 0),
      lastContactMs: undefined,
      nextStartMs: undefined,
      graceUntilMs: undefined,
      firstReportMs: undefined,
      overdueMs: undefined,
      ...evidence,
    },
  };
}

/** A failed report line of the given reading, its id the report's. */
export function readingLine(reading: ActivitySyncReading, overrides: Partial<ActivityFeedLine> = {}): ActivityFeedLine {
  return feedLine({ type: 'traffic', origin: 'phone', failed: true, syncReading: reading, ...overrides }, { kind: 'phone_report', id: String(reading.reportId), title: 'episode_action', detail: 'failed' });
}

/** Device-1's summary of the noon hour, received at 13:01 with no counts or deaths, overridden per test. */
export function tabletSummary(overrides: Partial<ActivityTabletSummary> = {}): ActivityTabletSummary {
  return { reportId: 12, deviceId: 'device-1', receivedAtMs: Date.UTC(2026, 9, 22, 13, 1), counts: [], droppedCount: 0, processDeaths: [], ...overrides };
}

/** The neutral line of one Bridge start and the given reports. */
export function bridgeOffLine(reports: readonly ActivitySyncReading[], bridgeStartMs = Date.UTC(2026, 9, 22, 11, 50)): ActivityFeedLine {
  return feedLine({ type: 'traffic', origin: 'phone', bridgeOff: { bridgeStartMs, reports } }, { kind: 'bridge_off', id: String(bridgeStartMs), atMs: bridgeStartMs });
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
