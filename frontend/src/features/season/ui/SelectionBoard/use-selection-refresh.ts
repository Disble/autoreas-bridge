import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { SEASON_ANIMES_REFRESH_BANNER, SEASON_REFRESH_BANNER } from '../../../../shared/season/season.constants';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';

/**
 * Reads the selected season and its candidates, syncing read outcomes to the banner.
 * @param source The season query port.
 * @returns The season and anime queries.
 */
export function useSelectionRefresh(source: SeasonQuerySource) {
  const seasonQuery = useDisplayedSeason({ refresh: 'mount', source });
  const animeQuery = useDisplayedSeasonAnimes({ refresh: 'mount', source });
  useSeasonBannerSync(seasonQuery, SEASON_REFRESH_BANNER);
  useSeasonBannerSync(animeQuery, SEASON_ANIMES_REFRESH_BANNER);
  return { seasonQuery, animeQuery };
}
