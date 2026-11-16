import type { SeasonSnapshot } from '../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { useSeasonStore } from '../store/season-store/season-store';
import { SEASON_SESSION_GC_TIME } from './season.constants';
import { displayedSeasonRead, toSeasonQueryEnabled } from './season.helpers';
import type { DisplayedSeasonOptions } from './season.types';

/**
 * Reads the season the screens show: the open season, or the past season the
 * store's `viewSeasonId` names while one is viewed read-only. The read stays
 * cached for the session, so a reader that never fetches still sees what the
 * Season route loaded.
 * @param options When the read fetches, and the port it goes through.
 * @returns The query result; `data` is null when no season is open.
 */
export function useDisplayedSeason({ refresh, source = BRIDGE_SEASON_SOURCE }: DisplayedSeasonOptions) {
  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);

  // 4. Queries/Mutations
  return useBridgeQuery<SeasonSnapshot | null>({
    ...displayedSeasonRead(source, viewSeasonId),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: toSeasonQueryEnabled(refresh),
  });
}
