import { useCallback, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { DEFAULT_MIN_APPROVAL_GRADE, DEFAULT_SLOTS } from './selection-board.constants';
import { countApproved, quotaStatus } from './selection-board.helpers';
import { useSelectionRefresh } from './use-selection-refresh';

/**
 * useSelectionRules owns the season's decision parameters: the minimum approval
 * grade and slot cap with their edits, the fixed read-only state, the live
 * approved count and quota status, and the season snapshot refresh. It reads and
 * writes only through the season store; the selection view never reaches here.
 *
 * @param source The season port the store reads and writes through.
 * @returns The parameters, their edits, the derived counts, and the rows the
 * candidates are derived from.
 */
export function useSelectionRules(source: SeasonSource) {
  // 3. Context/3rd Party Hooks
  const season = useSeasonStore((state) => state.season);
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const setMinApprovalGrade = useSeasonStore((state) => state.setMinApprovalGrade);
  const setSlots = useSeasonStore((state) => state.setSlots);

  // 5. Derived State (useMemo)
  const minApprovalGrade = season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = season?.slots ?? DEFAULT_SLOTS;
  const approvedCount = useMemo(() => countApproved(seasonAnimes, minApprovalGrade), [seasonAnimes, minApprovalGrade]);
  const quota = useMemo(() => quotaStatus(approvedCount, slots), [approvedCount, slots]);

  // 6. Callbacks
  const onSetMinApprovalGrade = useCallback(
    (grade: number) => void setMinApprovalGrade(source, grade),
    [setMinApprovalGrade, source],
  );
  const onSetSlots = useCallback((next: number) => void setSlots(source, next), [setSlots, source]);

  // 7. Effects
  useSelectionRefresh(source);

  return {
    readOnly,
    seasonName: season?.name ?? '',
    seasonAnimes,
    minApprovalGrade,
    slots,
    selectionConfirmedAt: season?.selectionConfirmedAt,
    approvedCount,
    quota,
    errorMessage,
    onSetMinApprovalGrade,
    onSetSlots,
  };
}
