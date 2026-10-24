import type { ActivityRunStep } from '../activity-source/activity-incident.types';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import type { ActivityRead } from '../ui/ActivityRunStory/activity-run-story.types';
import { toActivityFoundRead } from '../ui/ActivityRunStory/activity-time.helpers';
import { DRAWER_TASK_DOMAINS } from './drawer.constants';
import type { DrawerRequestGroup } from './drawer.types';

/** The body state of the drawer: exclusive loading, failure and resolved views. */
export type DrawerBodyStatus = 'loading' | 'failed' | 'ready';

/** A request group the owner picked, remembered with the line it was picked in. */
export interface DrawerPickedGroup {
  /** The line it was picked in. */
  readonly lineKey: string;
  /** The picked group's key. */
  readonly groupKey: string;
}

/**
 * A stable key of one feed line.
 *
 * @param line The line.
 * @returns `kind:id`.
 */
export function toDrawerLineKey(line: ActivityFeedLine): string {
  return `${line.line.kind}:${line.line.id}`;
}

/**
 * The runtime event id of an event line, whose metadata `GetActivityEvent` reads.
 *
 * @param line The open line.
 * @returns The event row id; undefined for other kinds or an id that is not a positive integer.
 */
export function toDrawerEventId(line: ActivityFeedLine): number | undefined {
  const id = Number(line.line.id);
  return line.line.kind === 'event' && /^\d+$/.test(line.line.id) && id > 0 ? id : undefined;
}

/**
 * The correlation id whose events the drawer reads (`GetActivityRunStory`):
 * only the lines whose summary shows a run story, a download run or a task event.
 *
 * @param line The open line.
 * @returns The correlation id, or undefined for other lines or a line without one.
 */
export function toDrawerStoryId(line: ActivityFeedLine): string | undefined {
  const { kind, domain, correlationId } = line.line;
  const hasStory = kind === 'download_run' || (kind === 'event' && DRAWER_TASK_DOMAINS.has(domain));
  return hasStory && correlationId !== '' ? correlationId : undefined;
}

/**
 * Reads one runtime event by id; gone when no event has that id.
 *
 * @param source The feed port.
 * @param id The event row id.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readDrawerEvent(source: ActivityFeedSource, id: number): Promise<ActivityRead<ActivityRunStep>> {
  return source.getEvent(id).then(toActivityFoundRead);
}

/** Words one stored metadata value as stored: strings as is, anything else as JSON. */
function wordMetadataValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The recorded metadata of one runtime event.
 *
 * @param event The stored event; undefined when not read or gone.
 * @returns Every key and value as stored; undefined when it recorded no metadata object.
 */
export function toDrawerEventMetadata(event: ActivityRunStep | undefined): Readonly<Record<string, string>> | undefined {
  if (event === undefined || event.metadataJson === '') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(event.metadataJson);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, wordMetadataValue(value)]));
  } catch {
    return undefined;
  }
}

/**
 * Combines the drawer's reads into one exclusive body state. A read without an
 * id, or one that is gone, does not hold the body.
 *
 * @param reads The incident and metadata reads.
 * @returns Loading while any reads, failed when any failed, else ready.
 */
export function toDrawerBodyStatus(reads: readonly (ActivityRead<unknown> | undefined)[]): DrawerBodyStatus {
  if (reads.some((read) => read?.status === 'loading')) {
    return 'loading';
  }
  return reads.some((read) => read?.status === 'failed') ? 'failed' : 'ready';
}

/**
 * The request group the panel shows: the one picked in this line, else the first.
 *
 * @param groups The line's groups.
 * @param picked The last pick.
 * @param lineKey The open line's key.
 * @returns The group, or undefined when there are none.
 */
export function pickDrawerGroup(groups: readonly DrawerRequestGroup[], picked: DrawerPickedGroup | undefined, lineKey: string): DrawerRequestGroup | undefined {
  const chosen = picked?.lineKey === lineKey ? groups.find((group) => group.key === picked.groupKey) : undefined;
  return chosen ?? groups[0];
}
