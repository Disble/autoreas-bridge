import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { SELECTION_SORT_OPTIONS } from './selection-board.constants';
import { useSelectionActions } from './use-selection-actions';
import { useSelectionCandidates } from './use-selection-candidates';
import { useSelectionRules } from './use-selection-rules';
import { useSelectionView } from './use-selection-view';

/**
 * useSelectionBoard composes the Selection board's three concerns: the season's
 * decision parameters (`useSelectionRules`), the created candidates with their
 * covers (`useSelectionCandidates`), and the view filters (`useSelectionView`),
 * plus the writes (`useSelectionActions`). The view narrows only what is
 * rendered: the quota, the confirmed milestone and the reconciliation keep
 * using every row. All derivation is pure (helpers) and all Wails I/O flows
 * through the store.
 *
 * @param source The season port the store reads and writes through.
 * @param coverSource The port each candidate's cover is resolved through.
 */
export function useSelectionBoard(source: SeasonSource = seasonSource, coverSource: SeasonCoverSource = bridgeRuntimeSource) {
  const rules = useSelectionRules(source);
  const { rows, getCoverThumb } = useSelectionCandidates(rules.seasonAnimes, rules.minApprovalGrade, coverSource);
  const view = useSelectionView(rows);
  const actions = useSelectionActions(source);

  return {
    readOnly: rules.readOnly,
    seasonName: rules.seasonName,
    minApprovalGrade: rules.minApprovalGrade,
    slots: rules.slots,
    rows,
    groups: view.groups,
    groupTotals: view.groupTotals,
    criteria: view.criteria,
    filterGroups: view.filterGroups,
    sortOptions: SELECTION_SORT_OPTIONS,
    summaryOptions: view.summaryOptions,
    activeFilterCount: view.activeFilterCount,
    matchingCount: view.visibleRows.length,
    totalCount: rows.length,
    onGroupChange: view.onGroupChange,
    onResetFilters: view.onResetFilters,
    onResetView: view.onResetView,
    onSortChange: view.onSortChange,
    approvedCount: rules.approvedCount,
    quota: rules.quota,
    selectionConfirmedAt: rules.selectionConfirmedAt,
    errorMessage: rules.errorMessage,
    onSetMinApprovalGrade: rules.onSetMinApprovalGrade,
    onSetSlots: rules.onSetSlots,
    onSetConsideration: actions.onSetConsideration,
    onConfirm: actions.onConfirm,
    onOpenPage: actions.onOpenPage,
    onCopyPage: actions.onCopyPage,
    onOpenFolder: actions.onOpenFolder,
    onCopyFolder: actions.onCopyFolder,
    getCoverThumb,
  };
}
