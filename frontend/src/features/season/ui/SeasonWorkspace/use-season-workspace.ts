import { useCallback, useEffect, useMemo } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { SEASON_SECTION_TABS } from './season-workspace.constants';
import { buildPastSeasonEntries, buildSeasonOverview, suggestSeasonName } from './season-workspace.helpers';

/**
 * useSeasonWorkspace loads the active season on mount and exposes the Overview
 * view model plus create/close callbacks. When no season is open it also loads
 * the past-seasons history so the user can open one read-only. All Wails I/O
 * flows through the season store; SeasonWorkspace.tsx is purely presentational.
 */
export function useSeasonWorkspace(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
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

  // 5. Derived State (useMemo)
  const isLoading = !hasLoaded;
  const overview = useMemo(() => (season ? buildSeasonOverview(season) : null), [season]);
  const suggestedName = useMemo(() => suggestSeasonName(new Date()), []);
  const pastSeasonEntries = useMemo(() => buildPastSeasonEntries(pastSeasons), [pastSeasons]);

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
  const onViewPastSeason = useCallback(
    (seasonId: string) => {
      void viewPastSeason(source, seasonId);
    },
    [viewPastSeason, source],
  );
  const onExitPastSeason = useCallback(() => {
    void exitPastSeason(source);
  }, [exitPastSeason, source]);

  // 7. Effects
  useEffect(() => {
    void refresh(source);
  }, [refresh, source]);

  // Load the history only when idle with no season open (and not already viewing
  // a past one), so the no-open-season view can list past seasons.
  useEffect(() => {
    if (hasLoaded && season === null && !readOnly) {
      void loadPastSeasons(source);
    }
  }, [hasLoaded, season, readOnly, loadPastSeasons, source]);

  return {
    season,
    isLoading,
    errorMessage,
    readOnly,
    overview,
    sections: SEASON_SECTION_TABS,
    suggestedName,
    pastSeasonEntries,
    onCreateSeason,
    onCloseSeason,
    onViewPastSeason,
    onExitPastSeason,
  };
}
