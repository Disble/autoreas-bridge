import { useSeasonStore } from '../../../shared/store/season-store/season-store';

/**
 * Returns whether a season is currently open, driving the Season nav item's
 * badge visibility. Reads the shared Season store selector directly so this
 * stays a single source of truth with the Season workspace.
 */
export function useSeasonNavBadge(): boolean {
  return useSeasonStore((state) => state.season !== null);
}
