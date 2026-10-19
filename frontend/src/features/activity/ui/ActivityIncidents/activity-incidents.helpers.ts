import type { Key } from '@heroui/react';
import { ACTIVITY_WHERE_OPTIONS } from '../../activity-source/activity-source.constants';
import type { ActivityIncidentSummary } from '../../activity-source/activity.types';
import type { ActivityRun, ActivityWhere } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { describeActivityRunOutcome, wordActivityEventType } from '../ActivityRunStory/activity-run-story.helpers';
import type { ActivityTone } from '../ActivityRunStory/activity-run-story.types';
import { formatActivityDayTime } from '../ActivityRunStory/activity-time.helpers';
import type { ActivityIncidentListEntry, ActivityIncidentListRead, ActivityIncidentOpenRequest, ActivityIncidentSelection } from './activity-incidents.types';

/**
 * Narrows a toggle key onto a filter value; anything else reads as All.
 *
 * @param key The key the toggle group reported.
 * @returns The filter Go reads.
 */
export function toActivityWhere(key: Key): ActivityWhere {
  return ACTIVITY_WHERE_OPTIONS.find((option) => option.id === key)?.id ?? 'all';
}

/**
 * Keys a selection the way the list keys its rows.
 *
 * @param selection The open item, if any.
 * @returns `incident:<id>`, `run:<correlationId>`, or empty.
 */
export function toActivitySelectionKey(selection: ActivityIncidentSelection | undefined): string {
  if (selection === undefined) {
    return '';
  }
  return selection.kind === 'incident' ? `incident:${selection.id}` : `run:${selection.correlationId}`;
}

/** A count with its noun, `1 step` / `3 steps`. */
function countWords(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** A run's dot: failed danger, recovered warning, the rest quiet. */
function runTone(outcome: string): ActivityTone {
  if (outcome === 'error') {
    return 'danger';
  }
  return outcome === 'warn' ? 'warning' : 'default';
}

/** A run's name: its first message, else its first type in words, else its id. */
function runTitle(run: ActivityRun): string {
  if (run.firstMessage !== '') {
    return run.firstMessage;
  }
  return run.firstEventType === '' ? `Run ${run.correlationId}` : wordActivityEventType(run.firstEventType);
}

/** One incident row. */
function toIncidentEntry(incident: ActivityIncidentSummary, heading: string): ActivityIncidentListEntry {
  const selection: ActivityIncidentSelection = { kind: 'incident', id: incident.latestId };
  const times = incident.occurrences > 1 ? ` · ${incident.occurrences} times` : '';
  return {
    key: toActivitySelectionKey(selection),
    selection,
    heading,
    title: incident.title,
    meta: `${formatActivityDayTime(incident.latestAtMs)}${times}`,
    tone: incident.isError ? 'danger' : 'warning',
    isNew: incident.isNew,
    chip: undefined,
  };
}

/** One run row; only a failed or recovered run carries a chip. */
function toRunEntry(run: ActivityRun, heading: string): ActivityIncidentListEntry {
  const selection: ActivityIncidentSelection = { kind: 'run', correlationId: run.correlationId };
  const tone = runTone(run.outcome);
  return {
    key: toActivitySelectionKey(selection),
    selection,
    heading,
    title: runTitle(run),
    meta: `${formatActivityDayTime(run.lastAtMs)} · ${countWords(run.steps, 'step')}`,
    tone,
    isNew: false,
    chip: tone === 'default' ? undefined : describeActivityRunOutcome(run.outcome),
  };
}

/**
 * Builds the left list: what went wrong, the incidents in Go's order, then the
 * recovered runs. Section headings appear only when runs are listed, since a
 * list of incidents alone needs no title of its own.
 *
 * @param incidents The incidents of the filter, newest first.
 * @param runs The recovered runs of the filter, newest first.
 * @returns The rows in render order.
 */
export function toActivityIncidentListEntries(incidents: readonly ActivityIncidentSummary[], runs: readonly ActivityRun[]): readonly ActivityIncidentListEntry[] {
  const hasRuns = runs.length > 0;
  return [
    ...incidents.map((incident, index) => toIncidentEntry(incident, hasRuns && index === 0 ? 'Incidents' : '')),
    ...runs.map((run, index) => toRunEntry(run, index === 0 ? 'Recovered runs' : '')),
  ];
}

/**
 * The one key a single-select collection reported; an empty pick or "all"
 * yields undefined, so a selection is never cleared by a stray press.
 *
 * @param keys What the collection's `onSelectionChange` reported.
 * @returns The picked key as a string, or undefined.
 */
export function toActivityPickedKey(keys: 'all' | Iterable<Key>): string | undefined {
  if (keys === 'all') {
    return undefined;
  }
  const [first] = keys;
  return first === undefined ? undefined : String(first);
}

/**
 * What an open request from another tab selects.
 *
 * @param openRequest The incident another tab asked to open, if any.
 * @returns That incident's selection, or undefined when none was asked.
 */
export function toActivityOpenSelection(openRequest: ActivityIncidentOpenRequest | undefined): ActivityIncidentSelection | undefined {
  return openRequest === undefined ? undefined : { kind: 'incident', id: openRequest.incidentId };
}

/**
 * Reads the list of one filter: its incidents and its recovered runs. Errors
 * are incidents already, and clean runs are in History, so neither is read.
 *
 * @param source The Activity port.
 * @param where The filter.
 * @returns The ready list read; rejects when either read fails.
 */
export function readActivityIncidentList(source: ActivitySource, where: ActivityWhere): Promise<ActivityIncidentListRead> {
  return Promise.all([source.listIncidents(where), source.listRecoveredRuns(where)]).then(([incidents, runList]) => ({ status: 'ready', value: toActivityIncidentListEntries(incidents, runList) }));
}
