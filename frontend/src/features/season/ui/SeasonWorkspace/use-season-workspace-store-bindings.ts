import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonWorkspaceStoreBindings } from './season-workspace.types';

/**
 * Subscribes to the Season store slices used by the Season Workspace.
 * @returns The season state and actions consumed by the workspace hook.
 */
export function useSeasonWorkspaceStoreBindings(): SeasonWorkspaceStoreBindings {
  const season = useSeasonStore((state) => state.season);
  const hasLoaded = useSeasonStore((state) => state.hasLoaded);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const pastSeasons = useSeasonStore((state) => state.pastSeasons);
  const refresh = useSeasonStore((state) => state.refresh);
  const createSeason = useSeasonStore((state) => state.createSeason);
  const closeSeason = useSeasonStore((state) => state.closeSeason);
  const loadPastSeasons = useSeasonStore((state) => state.loadPastSeasons);
  const viewPastSeason = useSeasonStore((state) => state.viewPastSeason);
  const exitPastSeason = useSeasonStore((state) => state.exitPastSeason);

  return {
    season,
    hasLoaded,
    errorMessage,
    readOnly,
    pastSeasons,
    refresh,
    createSeason,
    closeSeason,
    loadPastSeasons,
    viewPastSeason,
    exitPastSeason,
  };
}
