import { isSeasonOpen } from '../../../shared/store/season-store/season-store.helpers';
import { useSeasonStore } from '../../../shared/store/season-store/season-store';

/**
 * Returns whether a season is currently open, driving the Season nav item's
 * badge visibility. Reads the shared Season store selector directly so this
 * stays a single source of truth with the Season workspace, and resolves it
 * through the shared `isSeasonOpen` predicate, so a closed historical season
 * loaded by `viewPastSeason` never shows a badge.
 */
export function useSeasonNavBadge(): boolean {
  return useSeasonStore((state) => isSeasonOpen(state.season));
}
