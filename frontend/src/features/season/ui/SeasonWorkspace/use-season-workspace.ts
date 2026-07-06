import { useCallback, useEffect, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { SEASON_SECTION_TABS } from './season-workspace.constants';
import { buildSeasonOverview, suggestSeasonName } from './season-workspace.helpers';

/**
 * useSeasonWorkspace loads the active season on mount and exposes the Overview
 * view model plus create/close callbacks. All Wails I/O flows through the season
 * store and SeasonSource; SeasonWorkspace.tsx is purely presentational.
 */
export function useSeasonWorkspace(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const season = useSeasonStore((state) => state.season);
  const hasLoaded = useSeasonStore((state) => state.hasLoaded);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refresh = useSeasonStore((state) => state.refresh);
  const createSeason = useSeasonStore((state) => state.createSeason);
  const closeSeason = useSeasonStore((state) => state.closeSeason);

  // 5. Derived State (useMemo)
  const isLoading = !hasLoaded;
  const overview = useMemo(() => (season ? buildSeasonOverview(season) : null), [season]);
  const suggestedName = useMemo(() => suggestSeasonName(new Date()), []);

  // 6. Callbacks (useCallback calling the store)
  const onCreateSeason = useCallback(
    (name: string) => {
      void createSeason(source, name);
    },
    [createSeason, source],
  );
  const onCloseSeason = useCallback(() => {
    void closeSeason(source);
  }, [closeSeason, source]);

  // 7. Effects
  useEffect(() => {
    void refresh(source);
  }, [refresh, source]);

  return {
    season,
    isLoading,
    errorMessage,
    overview,
    sections: SEASON_SECTION_TABS,
    suggestedName,
    onCreateSeason,
    onCloseSeason,
  };
}
