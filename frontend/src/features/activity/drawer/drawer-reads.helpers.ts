import type { ActivityRunStory } from '../activity-source/activity-incident.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import type { ActivityRead } from '../ui/ActivityRunStory/activity-run-story.types';
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
 * The run story whose steps hold an event line's recorded metadata: only an
 * event with a correlation id that its own presenter does not read already.
 *
 * @param line The open line.
 * @returns The correlation id to read, or undefined.
 */
export function toDrawerMetadataStoryId(line: ActivityFeedLine): string | undefined {
  const { kind, correlationId, domain } = line.line;
  return kind === 'event' && correlationId !== '' && !DRAWER_TASK_DOMAINS.has(domain) ? correlationId : undefined;
}

/** Words one stored metadata value as stored: strings as is, anything else as JSON. */
function wordMetadataValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The recorded metadata of one event, read from its run story step.
 *
 * @param story The run story; undefined when not read.
 * @param eventId The event row id.
 * @returns Every key and value as stored; undefined when the step or its metadata is missing.
 */
export function toDrawerMetadata(story: ActivityRunStory | undefined, eventId: string): Readonly<Record<string, string>> | undefined {
  const step = story?.steps.find((candidate) => String(candidate.id) === eventId);
  if (step === undefined || step.metadataJson === '') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(step.metadataJson);
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
