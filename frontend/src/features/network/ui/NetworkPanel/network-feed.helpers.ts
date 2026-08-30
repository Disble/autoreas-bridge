import type { RuntimeEventCountGroup } from '../../../../shared/contracts/runtime-event.types';
import { fingerprintEventRow } from '../../../../shared/store/network-store/network-store.feed.helpers';
import {
  EVENT_PAGE_INITIAL_COUNT,
  NETWORK_ALL_DOMAINS_OPTION,
  NETWORK_ALL_DOMAINS_VALUE,
} from './network-panel.constants';
import type {
  EventFeedFilters,
  EventWindowInput,
  NetworkDomainFilterOption,
  OverlayAdmissionInput,
  RuntimeEventRow,
} from './network-panel.types';

/**
 * Reconciles the Runtime Events rail's visible window after the feed changes.
 *
 * Modelled on `reconcileVisibleRunCount`, with one deliberate strengthening:
 * rule 2 adds `prependedCount`. Run history reconciles against a whole
 * refreshed collection, where holding the count constant is correct. This feed
 * takes head insertions, so every already-rendered row shifts down one index —
 * a constant count would silently drop the bottom visible row on every single
 * event, which is exactly the rows a scrolling user is reading (design §4.1).
 *
 * The rules run in order: an empty feed falls back to the initial batch; the
 * window follows head insertions but never drops below the initial batch; a
 * fully revealed feed stays fully revealed; the selected row stays rendered;
 * and the result never exceeds the feed.
 */
export function reconcileVisibleEventCount(input: Readonly<EventWindowInput>): number {
  const { currentVisibleCount, previousTotal, nextRows, selectedId, prependedCount } = input;

  if (nextRows.length === 0) {
    return EVENT_PAGE_INITIAL_COUNT;
  }

  let visibleCount = Math.max(EVENT_PAGE_INITIAL_COUNT, Math.min(currentVisibleCount + prependedCount, nextRows.length));

  if (previousTotal > 0 && currentVisibleCount >= previousTotal) {
    visibleCount = nextRows.length;
  }

  if (selectedId !== null) {
    const selectedIndex = nextRows.findIndex((entry) => entry.id === selectedId);

    if (selectedIndex >= 0) {
      visibleCount = Math.max(visibleCount, selectedIndex + 1);
    }
  }

  return Math.min(visibleCount, nextRows.length);
}

/**
 * Decides whether one live push belongs on the overlay.
 *
 * An entry older than the newest persisted row belongs to a cursor page, not
 * to the overlay, and is rejected outright. Everything else is reconciled by
 * fingerprint against the rows already holding the head millisecond — the push
 * is emitted before the asynchronous INSERT assigns an id, so there is no id
 * to compare (design D-4). An entry strictly newer than the head cannot
 * fingerprint-match one of those rows, because the timestamp is part of the
 * fingerprint, so the two cases need no separate branch.
 */
export function admitOverlayEntry(input: Readonly<OverlayAdmissionInput>): boolean {
  const { entry, head, headRows, filters } = input;

  if (!matchesEventFilters(entry, filters)) {
    return false;
  }

  if (head !== null && entry.occurredAtMs < head) {
    return false;
  }

  const entryFingerprint = fingerprintEventRow(entry);

  return !headRows.some((persisted) => fingerprintEventRow(persisted) === entryFingerprint);
}

/**
 * Derives the domain filter's options from the unfiltered summary aggregate,
 * preserving its count-descending order and prepending the all-domains
 * sentinel. Blank keys are skipped rather than offered unlabelled, and an
 * empty aggregate yields the sentinel alone: the options describe what the
 * store actually holds, so nothing is fabricated (design D-5).
 */
export function toDomainFilterOptions(byDomain: readonly RuntimeEventCountGroup[]): readonly NetworkDomainFilterOption[] {
  const derived = byDomain
    .filter((group) => group.key !== '')
    .map((group) => ({ value: group.key, label: toDomainLabel(group.key) }));

  return [NETWORK_ALL_DOMAINS_OPTION, ...derived];
}

/**
 * Presents the feed as `[...overlay, ...page]`, newest-first. Neither side is
 * reordered: the overlay only grows at the head and pages only at the tail, so
 * concatenation is already time-ordered. A row the page has since caught up
 * with is dropped from the overlay half rather than rendered twice.
 */
export function mergeEventFeed(
  overlay: readonly RuntimeEventRow[],
  page: readonly RuntimeEventRow[],
): readonly RuntimeEventRow[] {
  if (overlay.length === 0) {
    return page;
  }

  const persistedIds = new Set(page.map((entry) => entry.id));

  return [...overlay.filter((entry) => !persistedIds.has(entry.id)), ...page];
}

/** Title-cases a raw domain key for display (`download` renders as `Download`). */
function toDomainLabel(key: string): string {
  return `${key.charAt(0).toUpperCase()}${key.slice(1).toLowerCase()}`;
}

/** Reports whether one row satisfies every active feed filter. */
function matchesEventFilters(entry: Readonly<RuntimeEventRow>, filters: Readonly<EventFeedFilters>): boolean {
  return (
    matchesDomainFilter(entry, filters.domain) &&
    matchesLevelFilter(entry, filters.level) &&
    matchesQueryFilter(entry, filters.query)
  );
}

/** Reports whether a row's domain matches the active domain filter. */
function matchesDomainFilter(entry: Readonly<RuntimeEventRow>, domain: string): boolean {
  return domain === NETWORK_ALL_DOMAINS_VALUE || entry.domain.toLowerCase() === domain.toLowerCase();
}

/** Reports whether a row's level matches the active level filter. */
function matchesLevelFilter(entry: Readonly<RuntimeEventRow>, level: string): boolean {
  return level === 'all' || entry.level.toLowerCase() === level.toLowerCase();
}

/** Reports whether a row matches the free-text filter over message, domain, and event type. */
function matchesQueryFilter(entry: Readonly<RuntimeEventRow>, query: string): boolean {
  if (query === '') {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return (
    entry.message.toLowerCase().includes(normalizedQuery) ||
    entry.domain.toLowerCase().includes(normalizedQuery) ||
    (entry.eventType ?? '').toLowerCase().includes(normalizedQuery)
  );
}
