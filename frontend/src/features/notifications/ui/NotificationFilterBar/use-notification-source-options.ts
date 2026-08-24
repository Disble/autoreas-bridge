import { useMemo, useState } from 'react';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { mergeSeenNotificationSources, toNotificationSourceOptions } from './notification-filter-bar.helpers';
import type { NotificationFilterOption } from './notification-filter-bar.types';

/** The empty accumulator every screen starts from, before a single page has landed. */
const NO_SOURCES_SEEN_YET: readonly string[] = [];

/**
 * Owns the source dropdown's offered options: the union of every source the
 * master list has loaded so far, accumulated across pages and filter changes.
 *
 * `source` is an open-ended producer string on the wire (`download`,
 * `season`, `device`, ...), so there is no closed set to hardcode -- and a
 * hardcoded one would be wrong the moment a new producer ships, either
 * offering a filter that matches nothing or hiding a source the user can
 * plainly see in the table. The set is therefore read out of the data, and
 * accumulated rather than recomputed because a narrowed page only carries the
 * source it was narrowed to.
 *
 * The union is merged during render rather than in an effect: the merge
 * returns its input by identity when nothing new arrived, so the state
 * settles in the same commit instead of costing an extra one
 * (`useProgressiveListWindow` uses the same render-phase shape).
 */
export function useNotificationSourceOptions(rows: readonly NotificationRow[]): readonly NotificationFilterOption[] {
  // 2. State
  const [seenSources, setSeenSources] = useState<readonly string[]>(NO_SOURCES_SEEN_YET);

  // 5. Derived State (render-phase accumulation, see the note above)
  const mergedSources = mergeSeenNotificationSources(seenSources, rows);
  if (mergedSources !== seenSources) {
    setSeenSources(mergedSources);
  }
  const options = useMemo(() => toNotificationSourceOptions(mergedSources), [mergedSources]);

  return options;
}
