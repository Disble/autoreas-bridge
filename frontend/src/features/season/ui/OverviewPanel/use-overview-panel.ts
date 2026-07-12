import { useEffect, useMemo } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { DEFAULT_MIN_APPROVAL_GRADE, DEFAULT_SLOTS } from '../SelectionBoard/selection-board.constants';
import { buildOverviewViewModel } from './overview-panel.helpers';

/**
 * useOverviewPanel drives the Overview tab: KPI tiles, the watching-pipeline and
 * intake-health charts, the grade histogram, and the slots meter, all derived
 * from the season store. There is no WebSocket/polling channel behind this data
 * — the real mechanism is refetch-on-mount (this hook's effect) plus
 * refetch-after-mutation (every store command already refetches on success), so
 * re-entering the Overview tab after a change elsewhere shows current data
 * because HeroUI Tabs remount inactive panels.
 */
export function useOverviewPanel(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const season = useSeasonStore((state) => state.season);
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refresh = useSeasonStore((state) => state.refresh);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);

  // 5. Derived State (useMemo)
  const minApprovalGrade = season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = season?.slots ?? DEFAULT_SLOTS;
  const viewModel = useMemo(
    () => buildOverviewViewModel(seasonAnimes, minApprovalGrade, slots),
    [seasonAnimes, minApprovalGrade, slots],
  );

  // 7. Effects
  useEffect(() => {
    // refreshAnimes (never ensureAnimesLoaded) so a season that progressed
    // while Overview was unmounted is never shown stale.
    void refresh(source);
    void refreshAnimes(source);
  }, [refresh, refreshAnimes, source]);

  return {
    readOnly,
    errorMessage,
    ...viewModel,
  };
}
