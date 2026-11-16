import type { SeasonAnimeRow } from '../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { useSeasonStore } from '../store/season-store/season-store';
import { SEASON_SESSION_GC_TIME } from './season.constants';
import { displayedSeasonAnimesRead, toSeasonQueryEnabled } from './season.helpers';
import type { DisplayedSeasonOptions } from './season.types';

/**
 * Reads the intake rows the screens show: the open season's, or the past
 * season's that the store's `viewSeasonId` names. A finished matching run
 * invalidates the open season's rows (`BRIDGE_INVALIDATIONS`); the read stays
 * cached for the session.
 * @param options When the read fetches, and the port it goes through.
 * @returns The query result.
 */
export function useDisplayedSeasonAnimes({ refresh, source = BRIDGE_SEASON_SOURCE }: DisplayedSeasonOptions) {
  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);

  // 4. Queries/Mutations
  return useBridgeQuery<readonly SeasonAnimeRow[]>({
    ...displayedSeasonAnimesRead(source, viewSeasonId),
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled: toSeasonQueryEnabled(refresh),
  });
}
