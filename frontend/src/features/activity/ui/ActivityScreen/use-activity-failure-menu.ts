import type { Key } from '@heroui/react';
import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { focusFailurePill } from '../../feed/activity-drawer-dismiss.helpers';
import { countFailures, toFailureMenuKeys, toFailureRows } from '../../feed/activity-feed-counts.helpers';
import { toFailureButtonState, toggleFailureTypes } from '../../feed/activity-feed-filters.helpers';
import { ACTIVITY_FAILURE_TYPES } from '../../feed/activity-feed.constants';
import type { ActivityFeedFilters } from '../../feed/activity-feed.types';
import type { ActivityOverview } from '../../feed-source/feed.types';
import { useActivityFailureMenuDismiss } from '../../feed/use-activity-failure-menu-dismiss';

/**
 * Owns the failure button and its menu (activity-ui-design-v2.md, Failure
 * button): whether the menu is open, its rows and keys, and the callbacks that
 * turn the failure filter on, open and close its menu (a press outside or Esc
 * closes it and keeps the filter on), pick its types and clear it.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param filters The screen filters.
 * @param setFilters Updates the screen filters.
 * @returns The failure button and menu models and their callbacks.
 */
export function useActivityFailureMenu(overview: ActivityOverview | undefined, filters: ActivityFeedFilters, setFilters: Dispatch<SetStateAction<ActivityFeedFilters>>) {
  // 1. Refs
  const failureGroupRef = useRef<HTMLDivElement>(null);

  // 2. State
  const [isFailureMenuOpen, setIsFailureMenuOpen] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const failureRows = useMemo(() => toFailureRows(overview, filters.types), [overview, filters.types]);
  const failureCount = countFailures(overview, filters.types);
  const failureMenuKeys = useMemo(() => toFailureMenuKeys(failureRows, filters.failureTypes), [failureRows, filters.failureTypes]);
  const failureButtonState = toFailureButtonState(filters.failuresOnly, isFailureMenuOpen);
  const isFailureMenuShown = failureButtonState === 'open';

  // 6. Callbacks (useCallback calling pure helpers)
  // The first press turns the failure filter on and opens the menu; later presses open or close it (design, Transitions).
  const onFailureToggle = useCallback(() => {
    setFilters((current) => (current.failuresOnly ? current : { ...current, failuresOnly: true }));
    setIsFailureMenuOpen((isOpen) => !filters.failuresOnly || !isOpen);
  }, [filters.failuresOnly, setFilters]);
  const onFailureMenuDismiss = useCallback(() => setIsFailureMenuOpen(false), []);
  // Esc closes the menu, keeps the filter on and gives focus back to the pill.
  const onFailureMenuEscape = useCallback(() => {
    setIsFailureMenuOpen(false);
    focusFailurePill(failureGroupRef.current);
  }, []);
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
  useActivityFailureMenuDismiss(failureGroupRef, isFailureMenuShown, `${failureCount}:${String(filters.failuresOnly)}`, onFailureMenuDismiss);

  return {
    failureButtonState,
    failureCount,
    failureRows,
    failureMenuKeys,
    failureGroupRef,
    isFailureMenuShown,
    onFailureToggle,
    onFailureMenuEscape,
    onFailureTypesChange,
    onFailureClear,
  };
}
