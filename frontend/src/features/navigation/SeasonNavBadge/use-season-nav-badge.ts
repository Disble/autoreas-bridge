import type { SeasonQuerySource } from '../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useDisplayedSeason } from '../../../shared/season/use-displayed-season';
import { isSeasonOpen } from '../../../shared/store/season-store/season-store.helpers';

/**
 * Returns whether a season is currently open, driving the Season nav item's
 * badge visibility. Reads the displayed season from the cache only (it never
 * fetches it, so a fresh start shows no badge until the Season route loaded
 * the season), and resolves it through the shared `isSeasonOpen` predicate, so
 * a closed historical season viewed read-only never shows a badge.
 * @param source The port the season read is keyed on; the runtime adapter by default.
 * @returns Whether the badge shows.
 */
export function useSeasonNavBadge(source: SeasonQuerySource = BRIDGE_SEASON_SOURCE): boolean {
  // 4. Queries/Mutations
  const { data: season } = useDisplayedSeason({ refresh: 'never', source });

  return isSeasonOpen(season ?? null);
}
