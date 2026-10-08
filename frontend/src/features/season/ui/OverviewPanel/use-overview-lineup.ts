import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonCoverSource, SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { buildOverviewLineupView, listLineupAnimeIds, readOverviewLineup, resolveOverviewLineup } from './overview-lineup.helpers';
import type { LoadedOverviewLineup, OverviewLineupView } from './overview-panel.types';

/**
 * Drives a closed season's final lineup: reads the ordering board the season
 * stored at close (never the live schedule), once per viewed season, joins the
 * season-owned grades, and resolves one cover per scheduled anime. A read that
 * settles after the viewed season changed is dropped.
 *
 * @param source The season port the closure snapshot is read through.
 * @param coverSource The port each anime's cover is resolved through.
 * @returns The card's render model, and the thumbnail props for an anime id.
 */
export function useOverviewLineup(
  source: SeasonSource = seasonSource,
  coverSource: SeasonCoverSource = bridgeRuntimeSource,
): { readonly view: OverviewLineupView; readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps } {
  // 2. State
  const [loaded, setLoaded] = useState<LoadedOverviewLineup | null>(null);

  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);

  // 5. Derived State
  const lineup = resolveOverviewLineup(viewSeasonId, loaded);
  const view = useMemo(() => buildOverviewLineupView(lineup, seasonAnimes), [lineup, seasonAnimes]);
  const animeIds = useMemo(() => listLineupAnimeIds(view), [view]);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  // 7. Effects
  useEffect(() => {
    if (viewSeasonId === null) {
      return undefined;
    }
    let isCurrent = true;
    void readOverviewLineup(source, viewSeasonId).then((result) => {
      if (isCurrent) {
        setLoaded(result);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [source, viewSeasonId]);

  return { view, getCoverThumb };
}
