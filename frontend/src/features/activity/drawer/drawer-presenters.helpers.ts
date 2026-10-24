import { formatActivityDuration } from '../ui/ActivityRunStory/activity-time.helpers';
import { getAnimeEstadoLabel } from '../../../shared/helpers/anime-estado.helpers';
import { toDrawerCause } from './drawer-cause.helpers';
import { DRAWER_CHANGE_FIELDS, DRAWER_HOUR_MS, DRAWER_MINUTE_MS, DRAWER_NO_RUN_EVENTS_NOTE, DRAWER_RECORDER_RETENTION_MS, DRAWER_TOTALS_ONLY_NOTE, DRAWER_WINDOW_ERROR_KIND_WORDS } from './drawer.constants';
import type { DrawerListItem, DrawerSection, DrawerSummaryInput } from './drawer.types';
import { drawerFact, formatDrawerKeptUntil, formatDrawerSpan, formatDrawerTime } from './drawer-format.helpers';
import { drawerPageFact, toDrawerPageName } from './drawer-window-error.helpers';

/** Reads one field of a stored snapshot; unreadable JSON reads as missing. */
function snapshotField(json: string, field: string): unknown {
  try {
    return (Object(JSON.parse(json)) as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}

/** Words a stored snapshot value; the anime state reads as its label. */
function wordSnapshotValue(field: string, value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (field === 'Estado' && typeof value === 'number') {
    return getAnimeEstadoLabel(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean);
}

/**
 * Layer 1 of every failed line: the recorded cause and the stored expiry, from its incident.
 *
 * @param input The summary input.
 * @returns The sections; empty without an incident.
 */
export function failureSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  if (input.incident === undefined) {
    return [];
  }
  const cause = toDrawerCause(input.incident);
  const why: DrawerSection[] = cause === undefined ? [] : [{ kind: 'cause', key: 'why', title: 'Why it failed', cause }];
  return [...why, ...earlierSections(input), { kind: 'note', key: 'kept', text: formatDrawerKeptUntil(input.incident.expiresAtMs) }];
}

/** "Happened N times": this occurrence and the earlier retained ones, newest first. */
function earlierSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const detail = input.incident;
  if (detail === undefined || detail.earlier.length === 0) {
    return [];
  }
  const times = [{ id: detail.incident.id, occurredAtMs: detail.incident.occurredAtMs }, ...detail.earlier];
  const items = times.map((time) => ({ key: String(time.id), time: formatDrawerTime(time.occurredAtMs), text: detail.incident.title, failed: true }));
  return [{ kind: 'list', key: 'times', title: `Happened ${times.length} times`, items }];
}

/**
 * The change and edit presenter: before → after of the action's field, then
 * when it was done and saved, then its failure.
 *
 * @param input The summary input.
 * @returns The sections.
 */
export function changeSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const { line } = input.line;
  const field = DRAWER_CHANGE_FIELDS[line.detail];
  const sections: DrawerSection[] = [];
  if (field !== undefined) {
    const before = wordSnapshotValue(field.field, snapshotField(line.beforeJson, field.field));
    const after = wordSnapshotValue(field.field, snapshotField(line.afterJson, field.field));
    sections.push({ kind: 'before-after', key: 'field', title: field.title, before, after });
  }
  if (input.line.type === 'change') {
    const late = line.marks.includes('arrived_late') && line.phoneAtMs !== undefined ? `${formatDrawerSpan(line.atMs - line.phoneAtMs)} late` : undefined;
    const rows = [
      ...(line.phoneAtMs === undefined ? [] : [drawerFact('phone', 'Done on the phone', formatDrawerTime(line.phoneAtMs))]),
      drawerFact('bridge', 'Reached the bridge', formatDrawerTime(line.atMs), { warnChip: late }),
    ];
    sections.push({ kind: 'facts', key: 'when', title: 'When', rows });
  } else {
    sections.push({ kind: 'facts', key: 'when', title: '', rows: [drawerFact('saved', 'Saved', formatDrawerTime(line.atMs))] });
  }
  return [...sections, ...failureSections(input)];
}

/** The folded requests of a traffic hour's incident that a list shows, per case. */
function trafficRequestItems(input: DrawerSummaryInput, failed: boolean): readonly DrawerListItem[] {
  const requests = input.incident?.requests ?? [];
  const picked = failed
    ? requests.filter((request) => (request.httpStatus ?? 0) >= 400)
    : [...requests].sort((a, b) => (b.maxDurationMs ?? 0) - (a.maxDurationMs ?? 0));
  return picked.map((request) => ({
    key: request.latestRequestId,
    time: formatDrawerTime(request.lastAtMs),
    text: failed
      ? `${request.routeTemplate} · ${request.httpStatus} ×${request.count}`
      : `${request.routeTemplate} · ${formatActivityDuration(request.maxDurationMs ?? 0)}`,
    failed,
  }));
}

/**
 * The traffic hour presenter: check-ins, refused and slowest, the hour, then
 * the refused or slow check-ins its incident pinned, or the totals-only note.
 *
 * @param input The summary input.
 * @returns The sections.
 */
export function trafficSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const hour = input.line.traffic;
  if (hour === undefined) {
    return [];
  }
  const sections: DrawerSection[] = [
    {
      kind: 'stats',
      key: 'figures',
      items: [
        { key: 'requests', value: String(hour.requests), label: 'check-ins', failed: false },
        { key: 'failed', value: String(hour.failed), label: 'refused', failed: hour.failed > 0 },
        { key: 'slowest', value: formatActivityDuration(hour.maxDurationMs), label: 'slowest', failed: false },
      ],
    },
    { kind: 'facts', key: 'hour', title: '', rows: [drawerFact('hour', 'Hour', `${formatDrawerTime(hour.hourStartMs)} – ${formatDrawerTime(hour.hourStartMs + DRAWER_HOUR_MS)}`)] },
  ];
  const failed = input.line.failed;
  const items = trafficRequestItems(input, failed);
  if (items.length > 0) {
    sections.push({ kind: 'list', key: 'requests', title: failed ? 'Refused check-ins' : 'Slow check-ins', items });
  }
  if (failed) {
    return [...sections, ...failureSections(input)];
  }
  if (input.incident === undefined && hour.hourStartMs + DRAWER_HOUR_MS < input.nowMs - DRAWER_RECORDER_RETENTION_MS) {
    sections.push({ kind: 'note', key: 'totals', text: DRAWER_TOTALS_ONLY_NOTE });
  }
  return sections;
}

/**
 * The run story of a run or task: its timeline, or a note when its read story
 * holds no stored event.
 *
 * @param input The summary input.
 * @param correlationId The id the story is read by.
 * @returns The sections.
 */
export function runStorySections(input: DrawerSummaryInput, correlationId: string): readonly DrawerSection[] {
  if (input.story?.steps.length === 0) {
    return [{ kind: 'note', key: 'no-events', text: DRAWER_NO_RUN_EVENTS_NOTE }];
  }
  return [{ kind: 'run-story', key: 'story', correlationId }];
}

/**
 * The download run presenter: the run story timeline, then its failure.
 *
 * @param input The summary input.
 * @returns The sections.
 */
export function runSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const run = input.line.run;
  if (run === undefined) {
    return [];
  }
  return [...runStorySections(input, run.runId), ...failureSections(input)];
}

/**
 * The window error presenter, from its stored `kind`, `route` and `message`.
 *
 * @param input The summary input.
 * @returns The sections; undefined when the metadata does not hold a known kind.
 */
export function windowErrorSections(input: DrawerSummaryInput): readonly DrawerSection[] | undefined {
  const kind = input.metadata?.kind ?? '';
  const words = DRAWER_WINDOW_ERROR_KIND_WORDS[kind];
  if (input.metadata === undefined || words === undefined) {
    return undefined;
  }
  const route = input.metadata.route ?? '';
  const { line } = input.line;
  const sentence = route === '' ? `The window ${words}.` : `The ${toDrawerPageName(route) ?? route} page ${words}.`;
  const around = (input.incident?.events ?? [])
    .filter((event) => String(event.id) !== line.id && Math.abs(event.atMs - line.atMs) <= 45 * DRAWER_MINUTE_MS)
    .map((event) => ({ key: String(event.id), time: formatDrawerTime(event.atMs), text: event.message, failed: event.level === 'error' }));
  return [
    { kind: 'cause', key: 'what', title: 'What happened', cause: { sentence, recordedMessage: '', code: kind } },
    ...(route === '' ? [] : [{ kind: 'facts' as const, key: 'where', title: 'Where', rows: [drawerPageFact('route', route)] }]),
    { kind: 'code', key: 'message', title: 'Message', text: input.metadata.message ?? line.title },
    ...(around.length === 0 ? [] : [{ kind: 'list' as const, key: 'around', title: 'Around it', items: around }]),
    ...(input.incident === undefined ? [] : [{ kind: 'note' as const, key: 'kept', text: formatDrawerKeptUntil(input.incident.expiresAtMs) }]),
  ];
}
