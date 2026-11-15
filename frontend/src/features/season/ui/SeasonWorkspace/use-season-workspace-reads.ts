import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { SEASON_LIST_BANNER, SEASON_REFRESH_BANNER } from '../../../../shared/season/season.constants';
import type { SeasonDataSource } from '../../../../shared/season/season.types';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonList } from '../../../../shared/season/use-season-list';
import { isSeasonListWanted } from './season-workspace.helpers';
import type { SeasonWorkspaceReads } from './season-workspace.types';
import { useSeasonWorkspaceAnimesLoad } from './use-season-workspace-animes-load';

/**
 * Reads what the Season Workspace shows: the displayed season on every mount
 * (loading while the season module starts), an open live season's rows, and the
 * past-seasons history while no season is open. Each read's failure reaches the
 * shared banner, and a new success clears it.
 * @param source The port the reads go through.
 * @param readOnly Whether a past season is being viewed.
 * @returns The displayed season, whether the screen still waits, and the history.
 */
export function useSeasonWorkspaceReads(source: SeasonDataSource, readOnly: boolean): SeasonWorkspaceReads {
  // 4. Queries/Mutations
  const seasonQuery = useDisplayedSeason({ refresh: 'mount', source });
  const season = seasonQuery.data ?? null;
  const isAwaitingAnimes = useSeasonWorkspaceAnimesLoad({ season, readOnly, source });
  const pastSeasonsQuery = useSeasonList(isSeasonListWanted(seasonQuery.isSuccess, season, readOnly), source);

  // 7. Effects
  useSeasonBannerSync(seasonQuery, SEASON_REFRESH_BANNER);
  useSeasonBannerSync(pastSeasonsQuery, SEASON_LIST_BANNER);

  return { season, isLoading: toAsyncView(seasonQuery).kind === 'loading' || isAwaitingAnimes, pastSeasons: pastSeasonsQuery.data };
}
