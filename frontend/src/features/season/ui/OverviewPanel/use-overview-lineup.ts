import { useMemo } from 'react';
import type { SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { BRIDGE_ANIME_SOURCE, BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonOrderingSnapshot } from '../../../../shared/season/use-season-ordering-snapshot';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonCoverSource, SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { buildOverviewLineupView, listLineupAnimeIds, toOverviewLineupState } from './overview-lineup.helpers';
import type { OverviewLineupView } from './overview-panel.types';

/**
 * Drives a closed season's final lineup: reads the ordering board the season
 * stored at close (never the live schedule) through the shared closure
 * snapshot query of the viewed season, joins the season-owned grades, and
 * resolves one cover per scheduled anime. Another season's read never shows
 * here: the lineup is loading until the viewed season's own read settles.
 *
 * @param source The season port the closure snapshot and the viewed season's
 * rows are read through.
 * @param coverSource The port each anime's cover is resolved through.
 * @returns The card's render model, and the thumbnail props for an anime id.
 */
export function useOverviewLineup(
  source: SeasonSource & SeasonQuerySource = BRIDGE_SEASON_SOURCE,
  coverSource: SeasonCoverSource = BRIDGE_ANIME_SOURCE,
): { readonly view: OverviewLineupView; readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps } {
  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);

  // 4. Queries/Mutations
  const snapshot = useSeasonOrderingSnapshot(viewSeasonId, source);
  const animesQuery = useDisplayedSeasonAnimes({ refresh: 'never', source });
  const seasonAnimes = animesQuery.data ?? SEASON_NO_ROWS;

  // 5. Derived State
  const canRead = source.fetchSeasonOrderingSnapshot !== undefined;
  const lineup = useMemo(() => toOverviewLineupState(viewSeasonId, canRead, snapshot), [viewSeasonId, canRead, snapshot]);
  const view = useMemo(() => buildOverviewLineupView(lineup, seasonAnimes), [lineup, seasonAnimes]);
  const animeIds = useMemo(() => listLineupAnimeIds(view), [view]);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  return { view, getCoverThumb };
}
