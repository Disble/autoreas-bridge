import type { SeasonSnapshot } from '../../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeQuery } from '../../query/use-bridge-query/use-bridge-query';
import { SEASON_CURRENT_KEY, SEASON_SESSION_GC_TIME } from '../season.constants';
import { toSeasonModeStatus } from './season-mode.helpers';
import type { SeasonModeSource, SeasonModeStatus } from './season-mode.types';

/**
 * Reads whether season mode is on, which is exactly "a season is open", from
 * the open-season query (`SEASON_CURRENT_KEY`, module `season`): the same
 * cache entry the Season screens read, so a season opened or closed there
 * reaches every reader. It ignores a past season viewed read-only.
 * @param source The port the open season is read through; the runtime adapter by default.
 * @param enabled Whether the read runs; a disabled read stays `pending`.
 * @returns The season mode status.
 */
export function useSeasonMode(source: SeasonModeSource = BRIDGE_SEASON_SOURCE, enabled = true): SeasonModeStatus {
  // 4. Queries/Mutations
  const query = useBridgeQuery<SeasonSnapshot | null>({
    queryKey: SEASON_CURRENT_KEY,
    queryFn: () => source.readSeason(),
    staleTime: 0,
    module: 'season',
    gcTime: SEASON_SESSION_GC_TIME,
    enabled,
  });

  return toSeasonModeStatus(query);
}
