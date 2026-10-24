import type { activityread, desktop } from '../../../../wailsjs/go/models';
import type {
  ActivityEventSummary,
  ActivityFoldedRequest,
  ActivityIncidentDetail,
  ActivityPhoneReport,
  ActivityRequestDetail,
  ActivityRun,
  ActivityRunStep,
  ActivityRunStory,
} from './activity-incident.types';

/** Maps one folded request row; a nil status or duration becomes undefined. */
function mapFoldedRequest(row: activityread.FoldedRequest): ActivityFoldedRequest {
  return {
    routeTemplate: row.RouteTemplate,
    httpStatus: row.HTTPStatus ?? undefined,
    count: row.Count,
    firstAtMs: row.FirstAtMS,
    lastAtMs: row.LastAtMS,
    latestRequestId: row.LatestRequestID,
    kind: row.Kind,
    outcome: row.Outcome,
    maxDurationMs: row.MaxDurationMS ?? undefined,
    containsTrigger: row.ContainsTrigger,
  };
}

/** Maps one runtime event summary; an empty entity id becomes undefined. */
function mapEventSummary(event: activityread.EventSummary): ActivityEventSummary {
  return {
    id: event.ID,
    atMs: event.AtMS,
    domain: event.Domain,
    level: event.Level,
    eventType: event.EventType,
    message: event.Message,
    correlationId: event.CorrelationID,
    entityId: event.EntityID === '' ? undefined : event.EntityID,
  };
}

/** Maps one phone report; a nil phone time becomes undefined. */
function mapPhoneReport(report: activityread.PhoneReport): ActivityPhoneReport {
  return {
    id: report.ID,
    atMs: report.AtMS,
    phoneAtMs: report.PhoneAtMS ?? undefined,
    deviceId: report.DeviceID,
    kind: report.Kind,
    outcome: report.Outcome,
  };
}

/** Maps one Go incident detail; nil lists become empty arrays. */
function mapIncidentDetail(detail: activityread.IncidentDetail): ActivityIncidentDetail {
  const occurrence = detail.Incident;
  return {
    incident: {
      id: occurrence.ID,
      fingerprint: occurrence.Fingerprint,
      reason: occurrence.Reason,
      title: occurrence.Title,
      occurredAtMs: occurrence.OccurredAtMS,
      windowStartMs: occurrence.WindowStartMS,
      windowEndMs: occurrence.WindowEndMS,
      sourceKind: occurrence.SourceKind,
      sourceId: occurrence.SourceID,
    },
    cause: { known: detail.Cause.Known, errorCode: detail.Cause.ErrorCode, message: detail.Cause.Message },
    requests: (detail.Requests ?? []).map(mapFoldedRequest),
    events: (detail.Events ?? []).map(mapEventSummary),
    phoneReports: (detail.PhoneReports ?? []).map(mapPhoneReport),
    earlier: (detail.Earlier ?? []).map((earlier) => ({ id: earlier.ID, occurredAtMs: earlier.OccurredAtMS })),
    expiresAtMs: detail.ExpiresAtMS,
  };
}

/**
 * Converts the `GetActivityIncident` answer. An occurrence that is no longer
 * stored is undefined, which the detail shows as gone rather than failed.
 *
 * @param result The payload the binding resolved with.
 * @returns The incident detail, or undefined when it is gone.
 */
export function mapActivityIncidentResult(result: desktop.ActivityIncidentResult): ActivityIncidentDetail | undefined {
  return result.found ? mapIncidentDetail(result.detail) : undefined;
}

/**
 * Converts the `GetActivityRequest` answer, keeping only what the request
 * detail renders. A capture that is no longer stored is undefined.
 *
 * @param result The payload the binding resolved with.
 * @returns The captured request, or undefined when it is gone.
 */
export function mapActivityRequestResult(result: desktop.ActivityRequestResult): ActivityRequestDetail | undefined {
  if (!result.found) {
    return undefined;
  }
  const detail = result.detail;
  return {
    requestId: detail.requestId,
    capturedAtMs: detail.capturedAtMs,
    kind: detail.kind,
    route: detail.route,
    transport: detail.transport,
    outcome: detail.outcome,
    errorCode: detail.errorCode ?? '',
    httpStatus: detail.httpStatus ?? undefined,
    durationMs: detail.durationMs ?? undefined,
    requestBody: detail.requestBody ?? undefined,
    requestBodyState: detail.requestBodyState ?? '',
    responseBody: detail.responseBody ?? undefined,
    responseBodyState: detail.responseBodyState ?? '',
    deviceName: detail.deviceName,
  };
}

/**
 * Converts one Go run.
 *
 * @param run The run `ListActivityRecoveredRuns` returned.
 * @returns The run the list renders.
 */
export function mapActivityRun(run: activityread.Run): ActivityRun {
  return {
    correlationId: run.CorrelationID,
    firstAtMs: run.FirstAtMS,
    lastAtMs: run.LastAtMS,
    steps: run.Steps,
    outcome: run.Outcome,
    firstEventType: run.FirstEventType,
    firstMessage: run.FirstMessage,
  };
}

/** Maps one run step; Go flattens its embedded event summary. */
function mapRunStep(step: activityread.RunStep): ActivityRunStep {
  return {
    ...mapEventSummary(step),
    durationMs: step.DurationMS ?? undefined,
    metadataJson: step.MetadataJSON,
  };
}

/**
 * Converts one Go run story; a nil step list becomes empty.
 *
 * @param story The story `GetActivityRunStory` returned.
 * @returns The ordered steps the run story renders.
 */
export function mapActivityRunStory(story: activityread.RunStory): ActivityRunStory {
  return {
    correlationId: story.CorrelationID,
    steps: (story.Steps ?? []).map(mapRunStep),
    truncated: story.Truncated,
  };
}
