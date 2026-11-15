import { useMemo } from 'react';
import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_REFRESH_BANNER, SEASON_REFRESH_BANNER } from '../../../../shared/season/season.constants';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { formatSeasonCreatedLabel } from '../SeasonWorkspace/season-workspace.helpers';
import { DEFAULT_MIN_APPROVAL_GRADE, DEFAULT_SLOTS } from '../SelectionBoard/selection-board.constants';
import { buildOutcomeFunnelSteps, buildOverviewViewModel, formatOutcomeMeta } from './overview-panel.helpers';

/**
 * useOverviewPanel drives the Overview tab: KPI tiles, the watching-pipeline and
 * intake-health charts, the grade histogram, the selection outcome, and a closed
 * season's outcome funnel, all derived from the displayed season and its rows.
 * Both reads run again whenever the tab mounts (HeroUI Tabs remount inactive
 * panels), so a season that progressed while Overview was unmounted is never
 * shown stale; a failed read keeps the loaded rows on screen and reports on the
 * shared banner. A viewed past season never changes, so it is not read again.
 * @param source The port the reads go through.
 */
export function useOverviewPanel(source: SeasonQuerySource = BRIDGE_SEASON_SOURCE) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);

  // 4. Queries/Mutations
  const seasonQuery = useDisplayedSeason({ refresh: 'mount', source });
  const animesQuery = useDisplayedSeasonAnimes({ refresh: 'mount', source });

  // 5. Derived State (useMemo)
  const season = seasonQuery.data;
  const seasonAnimes = animesQuery.data;
  const minApprovalGrade = season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = season?.slots ?? DEFAULT_SLOTS;
  const createdLabel = formatSeasonCreatedLabel(season?.createdAt ?? 0);
  const viewModel = useMemo(
    () => buildOverviewViewModel(seasonAnimes ?? [], minApprovalGrade, slots),
    [seasonAnimes, minApprovalGrade, slots],
  );
  const outcomeSteps = useMemo(() => buildOutcomeFunnelSteps(viewModel.kpi), [viewModel]);
  const outcomeMeta = formatOutcomeMeta(createdLabel, minApprovalGrade, viewModel.kpi);

  // 7. Effects
  useSeasonBannerSync(seasonQuery, SEASON_REFRESH_BANNER);
  useSeasonBannerSync(animesQuery, SEASON_ANIMES_REFRESH_BANNER);

  return {
    readOnly,
    errorMessage,
    outcomeSteps,
    outcomeMeta,
    ...viewModel,
  };
}
