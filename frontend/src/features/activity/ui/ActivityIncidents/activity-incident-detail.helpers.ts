import { ACTIVITY_MCP_SERVER_NAME } from '../../activity-source/activity-source.constants';
import type {
  ActivityEventSummary,
  ActivityFoldedRequest,
  ActivityIncidentDetail,
  ActivityIncidentOccurrence,
  ActivityPhoneReport,
} from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityRead, ActivityTone } from '../ActivityRunStory/activity-run-story.types';
import { formatActivityClock, formatActivityDayTime, formatActivityDuration, formatActivityOffset, toActivityFoundRead } from '../ActivityRunStory/activity-time.helpers';
import {
  ACTIVITY_FAILED_CAPTURE_OUTCOMES,
  ACTIVITY_INTERNAL_SOURCE_KIND,
  ACTIVITY_PHONE_FAILED_OUTCOME,
  ACTIVITY_SOURCE_KIND_WORDS,
} from './activity-incidents.constants';
import type { ActivityIncidentDetailModel, ActivityLaneMarker, ActivityLanesModel, ActivityRequestRowModel } from './activity-incidents.types';

/** Where a moment sits across the window, clamped to the axis; an empty window centers it. */
function positionPercent(atMs: number, startMs: number, endMs: number): number {
  if (endMs <= startMs) {
    return 50;
  }
  return Math.min(100, Math.max(0, ((atMs - startMs) / (endMs - startMs)) * 100));
}

/** A request row's tone: 5xx or a rejected capture failed, 4xx warns. */
function requestTone(request: ActivityFoldedRequest): ActivityTone {
  const status = request.httpStatus ?? 0;
  if (status >= 500 || ACTIVITY_FAILED_CAPTURE_OUTCOMES.includes(request.outcome)) {
    return 'danger';
  }
  return status >= 400 ? 'warning' : 'default';
}

/** An event's tone by level. */
function eventTone(event: ActivityEventSummary): ActivityTone {
  if (event.level === 'error') {
    return 'danger';
  }
  return event.level === 'warn' ? 'warning' : 'default';
}

/** A phone report's tone: only a reported failure is marked. */
function phoneTone(report: ActivityPhoneReport): ActivityTone {
  return report.outcome === ACTIVITY_PHONE_FAILED_OUTCOME ? 'danger' : 'default';
}

/** A count with its noun, `no request`, `1 request`, `5 requests`. */
function countWords(count: number, noun: string): string {
  if (count === 0) {
    return `no ${noun}`;
  }
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** ` (2 failed)` when any, else empty. */
function marked(count: number, word: string): string {
  return count > 0 ? ` (${count} ${word})` : '';
}

/** Hover text of a request marker. */
function requestTitle(request: ActivityFoldedRequest, atMs: number): string {
  const status = request.httpStatus === undefined ? request.outcome : String(request.httpStatus);
  const count = request.count > 1 ? ` · ×${request.count}` : '';
  return `${formatActivityClock(atMs)} · ${request.routeTemplate} · ${status}${count}`;
}

/** One or two markers per folded row: its first request, and its last when they differ. */
function requestMarkers(detail: ActivityIncidentDetail): readonly ActivityLaneMarker[] {
  const { windowStartMs, windowEndMs } = detail.incident;
  return detail.requests.flatMap((request) => {
    const moments = request.count > 1 && request.firstAtMs !== request.lastAtMs ? (['first', 'last'] as const) : (['last'] as const);
    return moments.map((moment) => {
      const atMs = moment === 'first' ? request.firstAtMs : request.lastAtMs;
      return {
        key: `request-${request.latestRequestId}-${moment}`,
        leftPercent: positionPercent(atMs, windowStartMs, windowEndMs),
        tone: requestTone(request),
        isTrigger: request.containsTrigger,
        title: requestTitle(request, atMs),
      };
    });
  });
}

/** Text alternative of the lanes: what each lane holds and what failed. */
function summarizeLanes(detail: ActivityIncidentDetail): string {
  const { windowStartMs, windowEndMs } = detail.incident;
  const failedReports = detail.phoneReports.filter((report) => phoneTone(report) === 'danger').length;
  const requests = detail.requests.reduce((sum, request) => sum + request.count, 0);
  const failedRequests = detail.requests.filter((request) => requestTone(request) !== 'default').reduce((sum, request) => sum + request.count, 0);
  const errors = detail.events.filter((event) => event.level === 'error').length;
  const warnings = detail.events.filter((event) => event.level === 'warn').length;
  const eventMarks = errors > 0 ? marked(errors, errors === 1 ? 'error' : 'errors') : marked(warnings, warnings === 1 ? 'warning' : 'warnings');
  return (
    `Window from ${formatActivityClock(windowStartMs)} to ${formatActivityClock(windowEndMs)}: ` +
    `${countWords(detail.phoneReports.length, 'phone report')}${marked(failedReports, 'failed')}, ` +
    `${countWords(requests, 'request')}${marked(failedRequests, 'failed')}, ` +
    `${countWords(detail.events.length, 'bridge event')}${eventMarks}.`
  );
}

/**
 * Draws the pinned window as three lanes on one axis: phone reports,
 * requests and bridge events, failures marked and the triggering fact flagged.
 *
 * @param detail The incident detail.
 * @returns The drawable lanes with their axis labels and text alternative.
 */
export function toActivityIncidentLanes(detail: ActivityIncidentDetail): ActivityLanesModel {
  const { windowStartMs, windowEndMs, occurredAtMs, sourceKind, sourceId } = detail.incident;
  const place = (atMs: number) => positionPercent(atMs, windowStartMs, windowEndMs);
  return {
    lanes: [
      {
        label: 'Phone',
        markers: detail.phoneReports.map((report) => ({
          key: `phone-${report.id}`,
          leftPercent: place(report.atMs),
          tone: phoneTone(report),
          isTrigger: false,
          title: `${formatActivityClock(report.atMs)} · ${report.kind}${report.outcome === '' ? '' : ` · ${report.outcome}`}`,
        })),
      },
      { label: 'Requests', markers: requestMarkers(detail) },
      {
        label: 'Bridge',
        markers: detail.events.map((event) => ({
          key: `event-${event.id}`,
          leftPercent: place(event.atMs),
          tone: eventTone(event),
          isTrigger: sourceKind === ACTIVITY_INTERNAL_SOURCE_KIND && String(event.id) === sourceId,
          title: `${formatActivityClock(event.atMs)} · ${event.message}`,
        })),
      },
    ],
    occurredPercent: place(occurredAtMs),
    startLabel: formatActivityOffset(windowStartMs - occurredAtMs),
    endLabel: formatActivityOffset(windowEndMs - occurredAtMs),
    summary: summarizeLanes(detail),
  };
}

/**
 * Words the window's folded request rows for the table.
 *
 * @param requests The folded rows Go returned.
 * @returns One table row each, same order.
 */
export function toActivityRequestRows(requests: readonly ActivityFoldedRequest[]): readonly ActivityRequestRowModel[] {
  return requests.map((request) => ({
    requestId: request.latestRequestId,
    time: formatActivityClock(request.lastAtMs),
    route: request.routeTemplate,
    countLabel: request.count > 1 ? `×${request.count}` : '',
    status: request.httpStatus === undefined ? '—' : String(request.httpStatus),
    statusTone: requestTone(request),
    duration: request.maxDurationMs === undefined ? '—' : formatActivityDuration(request.maxDurationMs),
    isTrigger: request.containsTrigger,
  }));
}

/**
 * The run an internal incident opens: the correlation id of the event that
 * fired it. Any other source, or an event without one, opens the request window.
 *
 * @param detail The incident detail.
 * @returns The correlation id, or undefined.
 */
export function findActivityIncidentRunId(detail: ActivityIncidentDetail): string | undefined {
  const { sourceKind, sourceId } = detail.incident;
  if (sourceKind !== ACTIVITY_INTERNAL_SOURCE_KIND) {
    return undefined;
  }
  const trigger = detail.events.find((event) => String(event.id) === sourceId);
  return trigger === undefined || trigger.correlationId === '' ? undefined : trigger.correlationId;
}

/**
 * The MCP-ready reference to one incident, for "Copy for AI".
 *
 * @param incident The occurrence.
 * @returns The tool call and a one-line context.
 */
export function toActivityIncidentCopyText(incident: ActivityIncidentOccurrence): string {
  return `Use the ${ACTIVITY_MCP_SERVER_NAME} tool get_incident with ${JSON.stringify({ id: incident.id })}.\nIncident: ${incident.title}, ${formatActivityDayTime(incident.occurredAtMs)}.`;
}

/** Earlier occurrences in words. */
function describeEarlier(detail: ActivityIncidentDetail): string {
  const latest = detail.earlier.at(0);
  if (latest === undefined) {
    return 'No earlier occurrence is kept.';
  }
  const when = formatActivityDayTime(latest.occurredAtMs);
  return detail.earlier.length === 1 ? `Happened once before, on ${when}.` : `Happened ${detail.earlier.length} times before, last on ${when}.`;
}

/**
 * Words one incident occurrence for the detail pane.
 *
 * @param detail The incident detail Go returned.
 * @returns Everything the detail pane renders.
 */
export function toActivityIncidentDetailModel(detail: ActivityIncidentDetail): ActivityIncidentDetailModel {
  const { incident, cause } = detail;
  return {
    title: incident.title,
    span: `${formatActivityDayTime(incident.windowStartMs)} → ${formatActivityClock(incident.windowEndMs).slice(0, 8)}`,
    chips: [
      { label: ACTIVITY_SOURCE_KIND_WORDS[incident.sourceKind] ?? incident.sourceKind, color: 'default' },
      { label: incident.reason.replaceAll('_', ' '), color: 'default' },
    ],
    cause: cause.known ? { code: cause.errorCode, message: cause.message } : undefined,
    lanes: toActivityIncidentLanes(detail),
    requests: toActivityRequestRows(detail.requests),
    earlierLine: describeEarlier(detail),
    expiryLine: `Kept until ${formatActivityDayTime(detail.expiresAtMs)}.`,
    copyText: toActivityIncidentCopyText(incident),
    runCorrelationId: findActivityIncidentRunId(detail),
  };
}

/**
 * Reads one incident occurrence; gone once it is no longer stored.
 *
 * @param source The Activity port.
 * @param incidentId The occurrence.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readActivityIncident(source: ActivitySource, incidentId: number): Promise<ActivityRead<ActivityIncidentDetail>> {
  return source.getIncident(incidentId).then(toActivityFoundRead);
}
