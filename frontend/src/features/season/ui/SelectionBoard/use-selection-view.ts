import { useCallback, useMemo, useState } from 'react';
import type { SelectionFilterKey, SelectionRow, SelectionSort, SelectionViewCriteria } from './selection-board.types';
import {
  countSelectionFilterValues,
  createSelectionView,
  filterSelectionRows,
  sortSelectionRows,
  toSelectionFilterGroups,
  toSelectionViewSummary,
} from './selection-view.helpers';
import { groupSelectionRows } from './selection-board.helpers';
import type { SelectionGroup } from './selection-board.types';

/**
 * useSelectionView owns the Selection board's view state: the live filter and
 * sort criteria, the rows and verdict groups they keep, the per-verdict totals
 * they are compared against, and the summary the toolbar renders. It never
 * writes to the rows it receives, so the view cannot change what confirmation,
 * the quota meter or the reconciliation do.
 *
 * @param rows Every created candidate, in board order.
 * @returns The criteria, the visible groups and counts, and the view edits.
 */
export function useSelectionView(rows: readonly SelectionRow[]) {
  // 2. State
  const [criteria, setCriteria] = useState<SelectionViewCriteria>(createSelectionView);

  // 5. Derived State (useMemo)
  const visibleRows = useMemo(() => filterSelectionRows(rows, criteria), [rows, criteria]);
  const groups = useMemo((): SelectionGroup[] => groupSelectionRows(sortSelectionRows(visibleRows, criteria.sort)), [visibleRows, criteria.sort]);
  const groupTotals = useMemo((): Readonly<Record<'approved' | 'rejected', number>> => {
    let approved = 0;
    for (const row of rows) {
      if (row.verdict === 'approved') {
        approved += 1;
      }
    }
    return { approved, rejected: rows.length - approved };
  }, [rows]);
  const filterGroups = useMemo(() => toSelectionFilterGroups(), []);
  const summaryOptions = useMemo(() => toSelectionViewSummary(criteria), [criteria]);
  const activeFilterCount = countSelectionFilterValues(criteria);

  // 6. Callbacks
  /** Applies one dimension's selected values, leaving the other dimensions untouched. */
  const onGroupChange = useCallback(
    (key: SelectionFilterKey, values: readonly string[]) => setCriteria({ ...criteria, [key]: values }),
    [criteria],
  );
  /** Clears every dimension and keeps the current order. */
  const onResetFilters = useCallback(() => setCriteria({ ...createSelectionView(), sort: criteria.sort }), [criteria.sort]);
  /** Restores the default view: no criteria and the current order. */
  const onResetView = useCallback(() => setCriteria(createSelectionView()), []);
  /** Applies a sort mode, keeping every criterion in force. */
  const onSortChange = useCallback((sort: SelectionSort) => setCriteria({ ...criteria, sort }), [criteria]);

  return {
    criteria,
    visibleRows,
    groups,
    groupTotals,
    filterGroups,
    summaryOptions,
    activeFilterCount,
    onGroupChange,
    onResetFilters,
    onResetView,
    onSortChange,
  };
}
