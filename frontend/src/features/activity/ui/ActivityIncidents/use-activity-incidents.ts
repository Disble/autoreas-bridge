import type { Key } from '@heroui/react';
import { useCallback, useState } from 'react';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivityWhere } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { toActivityReadValue } from '../ActivityRunStory/activity-time.helpers';
import { useActivityRead } from '../ActivityRunStory/use-activity-read';
import { ACTIVITY_NO_LIST_ENTRIES } from './activity-incidents.constants';
import { readActivityIncidentList, toActivityOpenSelection, toActivityPickedKey, toActivitySelectionKey, toActivityWhere } from './activity-incidents.helpers';
import type { ActivityIncidentOpenRequest, ActivityIncidentSelection } from './activity-incidents.types';

/**
 * Owns the Incidents tab: the "where it happened" filter, one list read per
 * filter (incidents, plus runs for internal bridge work), the progressive
 * window over that list, and what the detail pane shows. An incident another
 * tab asks to open replaces the selection; each request is a new object, so
 * asking for the same incident twice opens it twice. An answer for a filter
 * no longer selected is dropped.
 *
 * @param openRequest The incident another tab asked to open, if any.
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The filter, the list read and its window, the selection, and the actions.
 */
export function useActivityIncidents(openRequest: ActivityIncidentOpenRequest | undefined, source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State
  const [where, setWhere] = useState<ActivityWhere>('all');
  const [selection, setSelection] = useState<ActivityIncidentSelection | undefined>(toActivityOpenSelection(openRequest));
  const [seenRequest, setSeenRequest] = useState(openRequest);

  // Render-phase sync: a new open request from another tab replaces the selection.
  if (openRequest !== seenRequest) {
    setSeenRequest(openRequest);
    setSelection((current) => toActivityOpenSelection(openRequest) ?? current);
  }

  // 3. Context/3rd Party Hooks
  const { read: list, retry } = useActivityRead(source, where, readActivityIncidentList);
  const entries = toActivityReadValue(list) ?? ACTIVITY_NO_LIST_ENTRIES;
  const { scrollRef, onScroll, visibleCount } = useProgressiveListWindow(entries.length);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const selectedKey = toActivitySelectionKey(selection);
  const isFiltered = where !== 'all';

  // 6. Callbacks (useCallback calling pure helpers)
  const selectWhere = useCallback((keys: 'all' | Iterable<Key>) => {
    const picked = toActivityPickedKey(keys);
    if (picked !== undefined) {
      setWhere(toActivityWhere(picked));
    }
  }, []);

  const clearFilter = useCallback(() => {
    setWhere('all');
  }, []);

  const select = useCallback((next: ActivityIncidentSelection) => {
    setSelection(next);
  }, []);

  // 7. Effects

  return { where, list, entries, visibleCount, scrollRef, onScroll, selection, selectedKey, isFiltered, selectWhere, clearFilter, select, retry };
}
