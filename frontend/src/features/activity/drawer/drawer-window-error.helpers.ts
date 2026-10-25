import { APP_LAYOUT_NAV_GROUPS } from '../../../shared/navigation/app-layout.constants';
import type { ActivityIncidentDetail } from '../activity-source/activity-incident.types';
import type { DrawerBodyStatus } from './drawer-reads.helpers';
import { DRAWER_STACK_CUT_BYTES } from './drawer.constants';
import { drawerFact, formatDrawerSeconds, formatDrawerTime } from './drawer-format.helpers';
import type { DrawerFact, DrawerOccurrence, DrawerPickedOccurrence, DrawerWindowErrorDetail } from './drawer.types';

/**
 * The app page a stored route belongs to, named as the navigation names it.
 *
 * @param route The stored route, such as `/editor` or `#/catalog/12`.
 * @returns The page name; undefined for a route outside the navigation.
 */
export function toDrawerPageName(route: string): string | undefined {
  const path = route.replace(/^#/, '').split(/[?#]/)[0] ?? '';
  const segment = `/${path.split('/')[1] ?? ''}`;
  return APP_LAYOUT_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.to === segment)?.label;
}

/**
 * The Page fact: the page name with the stored route as a muted note, or the
 * stored route alone when no page has it.
 *
 * @param key Stable key.
 * @param route The stored route.
 * @returns The row.
 */
export function drawerPageFact(key: string, route: string): DrawerFact {
  const name = toDrawerPageName(route);
  return name === undefined ? drawerFact(key, 'Page', route, { mono: true }) : drawerFact(key, 'Page', name, { note: route });
}

/**
 * Whether a stored stack reached the report's limit, so it was cut.
 *
 * @param stack The stored stack.
 * @returns True at or above `DRAWER_STACK_CUT_BYTES` UTF-8 bytes.
 */
export function isDrawerStackCut(stack: string): boolean {
  return new TextEncoder().encode(stack).length >= DRAWER_STACK_CUT_BYTES;
}

/**
 * The occurrence picker of a repeated incident: this occurrence, then the earlier retained ones.
 *
 * @param incident The line's incident, once read.
 * @returns The occurrences; empty without an incident or an earlier occurrence.
 */
export function toDrawerOccurrences(incident: ActivityIncidentDetail | undefined): readonly DrawerOccurrence[] {
  if (incident === undefined || incident.earlier.length === 0) {
    return [];
  }
  const times = [{ id: incident.incident.id, occurredAtMs: incident.incident.occurredAtMs }, ...incident.earlier];
  return times.map((time) => ({ id: time.id, time: formatDrawerTime(time.occurredAtMs) }));
}

/**
 * A window error as `ReportFrontendError` stored it: kind, page, source and
 * time, then the message and the stack, and whether the stack was cut.
 *
 * @param metadata The event's recorded metadata.
 * @param fallbackMessage The event message, used when no message was stored.
 * @returns The detail.
 */
export function toDrawerWindowErrorFromMetadata(metadata: Readonly<Record<string, string>>, fallbackMessage: string): DrawerWindowErrorDetail {
  const occurredAtMs = Number(metadata.occurredAtMs);
  const facts: DrawerFact[] = [];
  if (metadata.kind) facts.push(drawerFact('kind', 'Kind', metadata.kind));
  if (metadata.route) facts.push(drawerPageFact('page', metadata.route));
  if (metadata.source) facts.push(drawerFact('source', 'Source', metadata.source, { mono: true }));
  if (Number.isFinite(occurredAtMs) && occurredAtMs > 0) facts.push(drawerFact('at', 'At', formatDrawerSeconds(occurredAtMs)));
  const stack = metadata.stack ?? '';
  return { facts, message: metadata.message ?? fallbackMessage, stack, stackCut: isDrawerStackCut(stack) };
}

/**
 * The occurrence the Data tab shows: the one picked in this line, else this occurrence.
 *
 * @param occurrences The line's occurrences.
 * @param picked The last pick.
 * @param lineKey The open line's key.
 * @returns The occurrence id; undefined without occurrences.
 */
export function pickDrawerOccurrenceId(occurrences: readonly DrawerOccurrence[], picked: DrawerPickedOccurrence | undefined, lineKey: string): number | undefined {
  const chosen = picked?.lineKey === lineKey ? occurrences.find((occurrence) => occurrence.id === picked.id) : undefined;
  return (chosen ?? occurrences[0])?.id;
}

/**
 * The runtime event an incident occurrence was fired by, whose metadata `GetActivityEvent` reads.
 *
 * The store leaves `sourceId` empty for frontend errors, so the window event
 * stored at the occurrence's own time stands in for it.
 *
 * @param detail The occurrence's incident detail, once read.
 * @returns The event row id; undefined when another kind of fact fired it or no event matches.
 */
export function toDrawerOccurrenceEventId(detail: ActivityIncidentDetail | undefined): number | undefined {
  if (detail?.incident.sourceKind !== 'event') {
    return undefined;
  }
  const { sourceId, occurredAtMs } = detail.incident;
  if (/^\d+$/.test(sourceId)) {
    return Number(sourceId);
  }
  return detail.events.find((event) => event.atMs === occurredAtMs)?.id;
}

/**
 * The read state of a picked earlier occurrence: an occurrence read whose
 * firing event cannot be found has nothing to show, so it fails instead of
 * leaving the Data tab blank.
 *
 * @param status The combined state of the occurrence and event reads.
 * @param eventMissing Whether the occurrence was read but no event fired it.
 * @returns The state the Data tab shows.
 */
export function toDrawerOccurrenceStatus(status: DrawerBodyStatus, eventMissing: boolean): DrawerBodyStatus {
  return eventMissing ? 'failed' : status;
}
