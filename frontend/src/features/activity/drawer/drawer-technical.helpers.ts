import type { ActivityIncidentDetail, ActivityRequestDetail } from '../activity-source/activity-incident.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { formatActivityDuration } from '../ui/ActivityRunStory/activity-time.helpers';
import { DRAWER_NO_RUN_EVENTS_NOTE, DRAWER_WINDOW_ERROR_EVENT_TYPE } from './drawer.constants';
import type { DrawerDataBlock, DrawerEventRow, DrawerRequestGroup, DrawerRequestPanel, DrawerSummaryInput, DrawerTechnicalTab, DrawerWindowErrorDetail } from './drawer.types';
import { formatDrawerSeconds, formatDrawerTime } from './drawer-format.helpers';
import { toDrawerWindowErrorFromMetadata } from './drawer-window-error.helpers';
import { toDrawerHeader } from './drawer-summary.helpers';

/**
 * The tabs of the technical view: Requests only for phone lines.
 *
 * @param line The open line.
 * @returns The tabs, in order.
 */
export function toDrawerTechnicalTabs(line: ActivityFeedLine): readonly DrawerTechnicalTab[] {
  return line.origin === 'phone' ? ['requests', 'events', 'data'] : ['events', 'data'];
}

/**
 * Keeps the chosen tab across lines when the open line has it.
 *
 * @param tabs The open line's tabs.
 * @param chosen The tab the owner last picked.
 * @returns The tab to show.
 */
export function pickDrawerTab(tabs: readonly DrawerTechnicalTab[], chosen: DrawerTechnicalTab): DrawerTechnicalTab {
  return tabs.includes(chosen) ? chosen : (tabs[0] ?? 'events');
}

/**
 * The route-and-status groups of the Requests tab, as the incident folded them.
 *
 * @param detail The line's incident; undefined when it has none.
 * @returns The groups; empty without an incident.
 */
export function toDrawerRequestGroups(detail: ActivityIncidentDetail | undefined): readonly DrawerRequestGroup[] {
  return (detail?.requests ?? []).map((request) => ({
    key: `${request.routeTemplate}|${request.httpStatus ?? ''}`,
    route: request.routeTemplate,
    status: request.httpStatus === undefined ? 'no answer' : String(request.httpStatus),
    failed: (request.httpStatus ?? 0) >= 400,
    count: request.count,
    latestTime: formatDrawerTime(request.lastAtMs),
    latestRequestId: request.latestRequestId,
  }));
}

/** Whether a stored reconcile response refused an operation inside a 200. */
function isNotApplied(body: string | undefined): boolean {
  try {
    const parsed = Object(JSON.parse(body ?? '')) as { readonly applied_operations?: unknown };
    return Array.isArray(parsed.applied_operations) && parsed.applied_operations.some((operation) => (Object(operation) as { applied?: unknown }).applied === false);
  } catch {
    return false;
  }
}

/**
 * The picked request's panel: a summary line that repeats nothing from the
 * header, its status, and the stored bodies with their cut states.
 *
 * @param group The picked group.
 * @param request Its latest request, as stored.
 * @returns The panel model.
 */
export function toDrawerRequestPanel(group: DrawerRequestGroup, request: ActivityRequestDetail): DrawerRequestPanel {
  const summary = [
    request.route,
    ...(request.durationMs === undefined ? [] : [formatActivityDuration(request.durationMs)]),
    ...(group.count > 1 ? [`latest of ${group.count} · ${group.latestTime}`] : []),
  ];
  return {
    summary,
    status: request.httpStatus === undefined ? 'no answer' : String(request.httpStatus),
    failed: (request.httpStatus ?? 0) >= 400,
    notApplied: isNotApplied(request.responseBody),
    requestBody: request.requestBody ?? '',
    requestCut: request.requestBodyState === 'truncated',
    responseBody: request.responseBody ?? '',
    responseCut: request.responseBodyState === 'truncated',
  };
}

/**
 * The request the Requests tab reads: the picked group's latest, only while
 * the technical view shows that tab.
 *
 * @param technical Whether the technical view is open.
 * @param tab The shown tab.
 * @param group The picked group; undefined without groups.
 * @returns The request id to read; undefined when nothing is read.
 */
export function toDrawerRequestId(technical: boolean, tab: DrawerTechnicalTab, group: DrawerRequestGroup | undefined): string | undefined {
  return technical && tab === 'requests' ? group?.latestRequestId : undefined;
}

/**
 * The picked request's panel once both the group and its request are known.
 *
 * @param group The picked group.
 * @param request Its latest request, once read.
 * @returns The panel; undefined until both are known.
 */
export function toDrawerPickedRequestPanel(group: DrawerRequestGroup | undefined, request: ActivityRequestDetail | undefined): DrawerRequestPanel | undefined {
  return group === undefined || request === undefined ? undefined : toDrawerRequestPanel(group, request);
}

/**
 * The runtime events of the Events tab: the run's stored story, else the
 * incident's window, else the event
 * line itself.
 *
 * @param input The summary input.
 * @returns The rows, oldest first.
 */
export function toDrawerEventRows(input: DrawerSummaryInput): readonly DrawerEventRow[] {
  const events = input.story?.steps.length ? input.story.steps : input.incident?.events;
  if (events !== undefined) {
    return events.map((event) => ({
      key: String(event.id),
      time: formatDrawerSeconds(event.atMs),
      level: event.level,
      message: event.message,
      domain: event.domain,
      detail: event.eventType,
    }));
  }
  const { line } = input.line;
  if (line.kind !== 'event') {
    return [];
  }
  return [{ key: line.id, time: formatDrawerSeconds(line.atMs), level: line.level, message: line.title, domain: line.domain, detail: line.detail }];
}

/**
 * Why the Events tab is empty, said only when it is known: the run's story was
 * read and holds no stored event, and no incident window replaces it.
 *
 * @param input The summary input.
 * @returns The note, or empty when the tab has rows or the reason is unknown.
 */
export function toDrawerEventsEmpty(input: DrawerSummaryInput): string {
  return input.story?.steps.length === 0 && input.incident === undefined ? DRAWER_NO_RUN_EVENTS_NOTE : '';
}

/**
 * The raw JSON blocks of the Data tab: a change's snapshots, the hourly total,
 * the run row, or the event with its recorded metadata.
 *
 * @param input The summary input.
 * @returns The blocks.
 */
export function toDrawerDataBlocks(input: DrawerSummaryInput): readonly DrawerDataBlock[] {
  const { line, traffic, run } = input.line;
  if (line.kind === 'change') {
    return [
      { label: 'Before', raw: line.beforeJson },
      { label: 'After', raw: line.afterJson },
    ];
  }
  if (traffic !== undefined) {
    return [{ label: 'Hourly total', raw: JSON.stringify(traffic) }];
  }
  if (run !== undefined) {
    return [{ label: 'Run', raw: JSON.stringify(run) }];
  }
  const metadata = input.metadata === undefined ? [] : [{ label: 'Recorded fields', raw: JSON.stringify(input.metadata) }];
  return [{ label: line.kind === 'event' ? 'Event' : 'Line', raw: JSON.stringify(line) }, ...metadata];
}

/**
 * The Data tab of a window error: kind, page, source and time, then the
 * message and the stack, every value as stored by `ReportFrontendError`.
 *
 * @param input The summary input.
 * @returns The detail; undefined for other events or when the metadata was not read.
 */
export function toDrawerWindowErrorDetail(input: DrawerSummaryInput): DrawerWindowErrorDetail | undefined {
  const { metadata } = input;
  if (input.line.line.detail !== DRAWER_WINDOW_ERROR_EVENT_TYPE || metadata === undefined) {
    return undefined;
  }
  return toDrawerWindowErrorFromMetadata(metadata, input.line.line.title);
}

/**
 * The "Copy for AI" text: an MCP-ready reference to the line, and in the
 * technical view also its events and data.
 *
 * @param input The summary input.
 * @param technical Whether the technical view is open.
 * @returns The clipboard text.
 */
export function toDrawerCopyText(input: DrawerSummaryInput, technical: boolean): string {
  const { line, incidentId } = input.line;
  const header = toDrawerHeader(input.line);
  const reference = [
    `Activity ${input.line.type} line ${line.kind} ${line.id} at ${new Date(line.atMs).toISOString()}`,
    ...(incidentId === undefined ? [] : [`incident ${incidentId}`]),
    ...(line.correlationId === '' ? [] : [`correlation ${line.correlationId}`]),
  ].join(' · ');
  const summary = [reference, [header.title, header.phrase].filter((part) => part !== '').join(' · ')];
  if (!technical) {
    return summary.join('\n');
  }
  const events = toDrawerEventRows(input).map((row) => `${row.time} ${row.level} ${row.domain} ${row.detail} ${row.message}`);
  const data = toDrawerDataBlocks(input).map((block) => `${block.label}: ${block.raw}`);
  return [...summary, ...events, ...data].join('\n');
}
