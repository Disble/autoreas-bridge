import type { CaptureSummary, CaptureSummaryGroup } from '../../../../shared/contracts/capture.types';
import type {
  RuntimeEventCountGroup,
  RuntimeEventSummary,
} from '../../../../shared/contracts/runtime-event.types';
import { formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
import {
  OVERVIEW_EVENT_SECTION_TITLES,
  OVERVIEW_LOADING_MESSAGE,
  OVERVIEW_NO_STATUS_LABEL,
  OVERVIEW_REQUESTS_DEGRADED_MESSAGE,
  OVERVIEW_UNLABELLED_KEY_LABEL,
} from './activity-overview.constants';
import type {
  EventCountRowViewModel,
  EventSampleRowViewModel,
  EventSummarySectionId,
  EventSummarySectionViewModel,
  RequestErrorSampleViewModel,
  RequestHealthRowViewModel,
} from './activity-overview.types';

/**
 * Formats an epoch-millis instant as a local-timezone `HH:MM:SS`, delegating to
 * the shared {@link formatLocalTime} so every bridge time renders in the
 * computer's own timezone rather than the backend's UTC.
 */
function formatOverviewTime(occurredAtMs: number): string {
  return formatLocalTime(new Date(occurredAtMs).toISOString());
}

/**
 * Formats a request-health group's HTTP status. An absent status is NAMED
 * rather than blanked or zeroed: the websocket transport never produces one,
 * and that is a property of the transport, not a missing measurement.
 */
export function toRequestStatusLabel(httpStatus: number | undefined): string {
  if (httpStatus === undefined) {
    return OVERVIEW_NO_STATUS_LABEL;
  }

  return String(httpStatus);
}

/**
 * Builds the stable row key for one request-health group. The statusless case
 * gets its own key segment so a group carrying no status can never collide with
 * a same-route, same-outcome group that has one.
 */
function toRequestHealthRowId(group: Readonly<CaptureSummaryGroup>): string {
  const statusKey = group.httpStatus === undefined ? 'no-status' : String(group.httpStatus);

  return `${group.route}|${statusKey}|${group.outcome}`;
}

/** Projects one group's bounded error samples into their presentation shape. */
function toRequestErrorSamples(
  samples: readonly Readonly<{ requestId: string; capturedAtMs: number; errorCode: string }>[],
): readonly RequestErrorSampleViewModel[] {
  return samples.map((sample) => ({
    requestId: sample.requestId,
    timeLabel: formatOverviewTime(sample.capturedAtMs),
    errorCode: sample.errorCode,
  }));
}

/**
 * Projects the request-health aggregation into table rows, preserving the
 * reader's count-descending order. An empty aggregation yields no rows — the
 * surface never fabricates a group to fill the table.
 */
export function toRequestHealthRows(summary: Readonly<CaptureSummary>): readonly RequestHealthRowViewModel[] {
  return summary.groups.map((group) => ({
    id: toRequestHealthRowId(group),
    route: group.route,
    statusLabel: toRequestStatusLabel(group.httpStatus),
    outcome: group.outcome,
    count: group.count,
    errorSamples: toRequestErrorSamples(group.latestErrorSamples),
  }));
}

/** Totals every group's count, so the surface can state how many requests the aggregation covers. */
export function sumRequestCounts(groups: readonly Readonly<CaptureSummaryGroup>[]): number {
  return groups.reduce((total, group) => total + group.count, 0);
}

/**
 * Formats one bucket's share of its OWN dimension with one decimal. A dimension
 * whose buckets total zero reports 0.0% instead of dividing by zero.
 */
function toShareLabel(count: number, dimensionTotal: number): string {
  if (dimensionTotal === 0) {
    return '0.0%';
  }

  return `${((count / dimensionTotal) * 100).toFixed(1)}%`;
}

/** Projects one grouping dimension's buckets into count rows carrying their in-dimension share. */
function toEventCountRows(groups: readonly RuntimeEventCountGroup[]): readonly EventCountRowViewModel[] {
  const dimensionTotal = groups.reduce((total, group) => total + group.count, 0);

  return groups.map((group) => ({
    key: group.key,
    label: group.key === '' ? OVERVIEW_UNLABELLED_KEY_LABEL : group.key,
    count: group.count,
    shareLabel: toShareLabel(group.count, dimensionTotal),
  }));
}

/** Builds one named grouping section from its dimension id and buckets. */
function toEventSummarySection(
  id: EventSummarySectionId,
  groups: readonly RuntimeEventCountGroup[],
): EventSummarySectionViewModel {
  return { id, title: OVERVIEW_EVENT_SECTION_TITLES[id], rows: toEventCountRows(groups) };
}

/**
 * Projects the runtime-event aggregation into its three independent grouping
 * sections. They are independent aggregations over the same matched set, so a
 * bucket's share is only ever meaningful inside its own dimension.
 */
export function toEventSummarySections(
  summary: Readonly<RuntimeEventSummary>,
): readonly EventSummarySectionViewModel[] {
  return [
    toEventSummarySection('domain', summary.byDomain),
    toEventSummarySection('level', summary.byLevel),
    toEventSummarySection('eventType', summary.byEventType),
  ];
}

/** Projects the aggregation's bounded newest samples into their presentation shape. */
export function toEventSampleRows(summary: Readonly<RuntimeEventSummary>): readonly EventSampleRowViewModel[] {
  return summary.samples.map((sample) => ({
    id: String(sample.id),
    timeLabel: formatOverviewTime(sample.occurredAtMs),
    domain: sample.domain,
    level: sample.level,
    message: sample.message,
  }));
}

/**
 * Resolves the request-health surface's disclosed reason. A failed read is
 * stated so zero groups are never presented as a measured "nothing failed".
 */
export function resolveRequestSummaryStatusMessage(degraded: boolean): string | null {
  if (degraded) {
    return OVERVIEW_REQUESTS_DEGRADED_MESSAGE;
  }

  return null;
}

/**
 * Resolves the copy an overview table shows in place of rows.
 *
 * It never carries a disclosed reason. Unlike the Runtime Events rail, a
 * degraded overview read returns nothing to keep showing, so the surface
 * replaces the whole table with the disclosure instead of repeating that
 * sentence once per table — and the empty copy here only ever describes a
 * healthy, resolved, empty read.
 */
export function resolveOverviewEmptyMessage(isLoading: boolean, emptyMessage: string): string {
  return isLoading ? OVERVIEW_LOADING_MESSAGE : emptyMessage;
}
