import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import type { NotificationFilterOption } from './notification-filter-bar.types';

/** Capitalizes a raw producer string into the label the dropdown shows for it. */
function toSourceLabel(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/**
 * Unions the sources a freshly loaded page carries into the set already
 * offered, alphabetically.
 *
 * It accumulates rather than replaces because the page it reads is itself
 * filtered: the moment the user picks one source, every later page carries
 * only that source, and a dropdown derived from the page alone would collapse
 * to the single option the user is already standing on -- with no way back to
 * the others. Sources seen once therefore stay on offer for the life of the
 * screen.
 *
 * Returns `seen` by identity when the page brings nothing new, which is what
 * lets the caller accumulate with a render-phase state update instead of an
 * effect (autoreas-theme 1.0.11's reset pattern, in reverse).
 */
export function mergeSeenNotificationSources(
  seen: readonly string[],
  rows: readonly NotificationRow[],
): readonly string[] {
  const merged = new Set(seen);
  for (const row of rows) {
    if (row.source !== '') {
      merged.add(row.source);
    }
  }
  if (merged.size === seen.length) {
    return seen;
  }
  return [...merged].sort((left, right) => left.localeCompare(right));
}

/**
 * Turns the accumulated raw sources into the dropdown's options, keeping the
 * raw value the list request is built from beside the label the user reads.
 */
export function toNotificationSourceOptions(sources: readonly string[]): readonly NotificationFilterOption[] {
  return sources.map((source) => ({ value: source, label: toSourceLabel(source) }));
}
