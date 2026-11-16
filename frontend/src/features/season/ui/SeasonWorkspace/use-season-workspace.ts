import { useCallback, useMemo } from 'react';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { SeasonDataSource } from '../../../../shared/season/season.types';
import { usePastSeasonView } from '../../../../shared/season/use-past-season-view';
import { useSeasonLifecycleCommands } from '../../../../shared/season/use-season-lifecycle-commands';
import { SEASON_SECTION_TABS } from './season-workspace.constants';
import { buildPastSeasonEntries, suggestSeasonName, toSeasonOverview } from './season-workspace.helpers';
import { useSeasonWorkspaceReads } from './use-season-workspace-reads';
import { useSeasonWorkspaceStoreBindings } from './use-season-workspace-store-bindings';
import { useSeasonWorkspaceTab } from './use-season-workspace-tab';

/**
 * useSeasonWorkspace reads the displayed season on mount (staying loading while
 * the season module starts) and exposes the Overview view model plus create/close
 * callbacks. When no season is open it also reads the past-seasons history so the
 * user can open one read-only. Reads and commands go through `shared/season`;
 * SeasonWorkspace.tsx is purely presentational.
 * @param source The port the season reads and commands go through.
 */
export function useSeasonWorkspace(source: SeasonDataSource = BRIDGE_SEASON_SOURCE) {
  // 2. State and 3. Context/3rd Party Hooks
  const { errorMessage, readOnly } = useSeasonWorkspaceStoreBindings();
  const { activeTab, selectTab } = useSeasonWorkspaceTab();

  // 4. Queries/Mutations
  const { season, isLoading, pastSeasons } = useSeasonWorkspaceReads(source, readOnly);
  const { createSeason, closeSeason } = useSeasonLifecycleCommands(source);
  const { viewPastSeason, exitPastSeason } = usePastSeasonView(source);

  // 5. Derived State (useMemo)
  const overview = useMemo(() => toSeasonOverview(season), [season]);
  const suggestedName = useMemo(() => suggestSeasonName(new Date()), []);
  const pastSeasonEntries = useMemo(() => buildPastSeasonEntries(pastSeasons ?? []), [pastSeasons]);

  // 6. Callbacks
  const onCreateSeason = useCallback(
    (name: string) => {
      void createSeason(name);
    },
    [createSeason],
  );
  const onCloseSeason = useCallback(() => {
    void closeSeason();
  }, [closeSeason]);
  const onExitPastSeason = useCallback(() => {
    void exitPastSeason();
  }, [exitPastSeason]);

  return {
    season,
    isLoading,
    errorMessage,
    readOnly,
    overview,
    sections: SEASON_SECTION_TABS,
    activeTab,
    selectTab,
    suggestedName,
    pastSeasonEntries,
    onCreateSeason,
    onCloseSeason,
    onViewPastSeason: viewPastSeason,
    onExitPastSeason,
  };
}
