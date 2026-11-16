import { useMemo } from 'react';
import type { SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { DEFAULT_MIN_APPROVAL_GRADE, DEFAULT_SLOTS } from './selection-board.constants';
import { countApproved, quotaStatus } from './selection-board.helpers';
import { useSelectionOptimisticRules } from './use-selection-optimistic-rules';
import { useSelectionRefresh } from './use-selection-refresh';

/**
 * Reads selection rules and rows from the season queries, retaining local optimistic rule edits.
 * @param source The season query and command port.
 * @returns The current rules, counts, state and handlers.
 */
export function useSelectionRules(source: SeasonSource & SeasonQuerySource) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);

  // 4. Queries/Mutations
  const { seasonQuery, animeQuery } = useSelectionRefresh(source);

  // 5. Derived State
  const season = seasonQuery.isPlaceholderData ? undefined : seasonQuery.data;
  const seasonAnimes = animeQuery.isPlaceholderData ? SEASON_NO_ROWS : animeQuery.data ?? SEASON_NO_ROWS;
  const optimistic = useSelectionOptimisticRules(source, season, readOnly);
  const minApprovalGrade = optimistic.grade ?? season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = optimistic.slots ?? season?.slots ?? DEFAULT_SLOTS;
  const approvedCount = useMemo(() => countApproved(seasonAnimes, minApprovalGrade), [seasonAnimes, minApprovalGrade]);
  const quota = useMemo(() => quotaStatus(approvedCount, slots), [approvedCount, slots]);
  const seasonView = seasonQuery.isPlaceholderData ? { kind: 'loading' as const } : toAsyncView(seasonQuery);
  const animeView = animeQuery.isPlaceholderData ? { kind: 'loading' as const } : toAsyncView(animeQuery);

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
    seasonView,
    animeView,
    onSetMinApprovalGrade: optimistic.onSetMinApprovalGrade,
    onSetSlots: optimistic.onSetSlots,
  };
}
