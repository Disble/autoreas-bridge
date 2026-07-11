import { useCallback, useEffect, useMemo } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { ConfirmSelectionResult, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { DEFAULT_MIN_APPROVAL_GRADE, DEFAULT_SLOTS } from './selection-board.constants';
import { countApproved, quotaStatus, toSelectionRows } from './selection-board.helpers';

/**
 * useSelectionBoard drives the Excel-replacement decision board: it derives live
 * verdicts, the approved count, and the quota status from the season store, and
 * exposes the parameter/consideration edits plus the confirm action. All
 * derivation is pure (helpers) and all Wails I/O flows through the store.
 */
export function useSelectionBoard(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const season = useSeasonStore((state) => state.season);
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refresh = useSeasonStore((state) => state.refresh);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const setMinApprovalGrade = useSeasonStore((state) => state.setMinApprovalGrade);
  const setSlots = useSeasonStore((state) => state.setSlots);
  const setConsideration = useSeasonStore((state) => state.setConsideration);
  const confirmSelection = useSeasonStore((state) => state.confirmSelection);

  // 5. Derived State (useMemo)
  const minApprovalGrade = season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = season?.slots ?? DEFAULT_SLOTS;
  const rows = useMemo(() => toSelectionRows(seasonAnimes, minApprovalGrade), [seasonAnimes, minApprovalGrade]);
  const approvedCount = useMemo(() => countApproved(seasonAnimes, minApprovalGrade), [seasonAnimes, minApprovalGrade]);
  const quota = useMemo(() => quotaStatus(approvedCount, slots), [approvedCount, slots]);

  // 6. Callbacks
  const onSetMinApprovalGrade = useCallback(
    (grade: number) => void setMinApprovalGrade(source, grade),
    [setMinApprovalGrade, source],
  );
  const onSetSlots = useCallback((next: number) => void setSlots(source, next), [setSlots, source]);
  const onSetConsideration = useCallback(
    (rowId: string, consideration: string) => void setConsideration(source, rowId, consideration),
    [setConsideration, source],
  );
  const onConfirm = useCallback((): Promise<ConfirmSelectionResult> => confirmSelection(source), [confirmSelection, source]);

  // 7. Effects
  useEffect(() => {
    void refresh(source);
    void refreshAnimes(source);
  }, [refresh, refreshAnimes, source]);

  return {
    readOnly,
    seasonName: season?.name ?? '',
    minApprovalGrade,
    slots,
    rows,
    approvedCount,
    quota,
    errorMessage,
    onSetMinApprovalGrade,
    onSetSlots,
    onSetConsideration,
    onConfirm,
  };
}
