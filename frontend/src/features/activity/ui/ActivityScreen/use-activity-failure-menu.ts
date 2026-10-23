import type { Key } from '@heroui/react';
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { countFailures, toFailureMenuKeys, toFailureRows } from '../../feed/activity-feed-counts.helpers';
import { toFailureButtonState, toggleFailureTypes } from '../../feed/activity-feed-filters.helpers';
import { ACTIVITY_FAILURE_TYPES } from '../../feed/activity-feed.constants';
import type { ActivityFeedFilters } from '../../feed/activity-feed.types';
import type { ActivityOverview } from '../../feed-source/feed.types';

/**
 * Owns the failure button and its menu (activity-ui-design-v2.md, Failure
 * button): whether the menu is open, its rows and keys, and the callbacks that
 * turn the failure filter on, pick its types and clear it.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param filters The screen filters.
 * @param setFilters Updates the screen filters.
 * @returns The failure button and menu models and their callbacks.
 */
export function useActivityFailureMenu(overview: ActivityOverview | undefined, filters: ActivityFeedFilters, setFilters: Dispatch<SetStateAction<ActivityFeedFilters>>) {
  // 1. Refs

  // 2. State
  const [isFailureMenuOpen, setIsFailureMenuOpen] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const failureRows = useMemo(() => toFailureRows(overview), [overview]);
  const failureCount = countFailures(overview);
  const failureMenuKeys = useMemo(() => toFailureMenuKeys(failureRows, filters.failureTypes), [failureRows, filters.failureTypes]);
  const failureButtonState = toFailureButtonState(filters.failuresOnly, isFailureMenuOpen);

  // 6. Callbacks (useCallback calling pure helpers)
  // Opening the menu turns the failure filter on; closing it keeps the filter on (design, Failure button).
  const onFailureMenuOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setFilters((current) => ({ ...current, failuresOnly: true }));
      }
      setIsFailureMenuOpen(isOpen);
    },
    [setFilters],
  );
  // A disabled row shows unselected but keeps its pick for when its type fails again.
  const onFailureTypesChange = useCallback(
    (keys: Set<Key> | 'all') =>
      setFilters((current) => toggleFailureTypes(current, new Set([...(keys === 'all' ? ACTIVITY_FAILURE_TYPES : keys), ...failureMenuKeys.keptDisabled]))),
    [failureMenuKeys.keptDisabled, setFilters],
  );
  const onFailureClear = useCallback(() => {
    setFilters((current) => ({ ...current, failuresOnly: false }));
    setIsFailureMenuOpen(false);
  }, [setFilters]);

  // 7. Effects

  return { failureButtonState, failureCount, failureRows, failureMenuKeys, onFailureMenuOpenChange, onFailureTypesChange, onFailureClear };
}
