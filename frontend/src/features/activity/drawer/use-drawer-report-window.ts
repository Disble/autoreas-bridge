import { useMemo } from 'react';
import { useProgressiveListWindow } from '../../../shared/hooks/use-progressive-list-window';

/**
 * Keeps a group's report list to one batch and grows it near its bottom
 * (ADR-012): a Bridge off group holds every report that waited for one start.
 *
 * @param items The whole list.
 * @returns The rows to render, and the scroll area's ref and handler.
 */
export function useDrawerReportWindow<T>(items: readonly T[]) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const { scrollRef, onScroll, visibleCount } = useProgressiveListWindow(items.length);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { scrollRef, onScroll, visibleItems };
}
