import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';

/**
 * Returns whether a season is currently open, driving the Today page's slim
 * season banner visibility. Reads the displayed season from the cache only (it
 * never fetches it), and resolves it through the shared `isSeasonOpen`
 * predicate, so a closed historical season viewed read-only never reads as open.
 * @param source The port the season read is keyed on; the runtime adapter by default.
 * @returns Whether the banner shows.
 */
export function useTodaySeasonBanner(source: SeasonQuerySource = BRIDGE_SEASON_SOURCE): boolean {
  // 4. Queries/Mutations
  const { data: season } = useDisplayedSeason({ refresh: 'never', source });

  return isSeasonOpen(season ?? null);
}
