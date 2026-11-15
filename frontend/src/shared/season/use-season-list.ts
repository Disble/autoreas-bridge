import type { SeasonQuerySource } from '../contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { SEASON_LIST_KEY } from './season.constants';

/**
 * Reads every season, newest first, for the past-seasons history.
 * @param enabled Whether the list is read; the workspace reads it only while no season is open.
 * @param source The port the read goes through.
 * @returns The query result.
 */
export function useSeasonList(enabled: boolean, source: SeasonQuerySource = BRIDGE_SEASON_SOURCE) {
  // 4. Queries/Mutations
  return useBridgeQuery({ queryKey: SEASON_LIST_KEY, queryFn: () => source.readSeasons(), module: 'season', enabled });
}
