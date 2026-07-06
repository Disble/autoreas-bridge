import { useCallback, useEffect, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { countUnresolved } from './intake-panel.helpers';

/**
 * useIntakePanel loads the active season's intake rows on mount and exposes the
 * import / match / resolve / discard callbacks. All Wails I/O flows through the
 * season store and SeasonSource; IntakePanel.tsx is purely presentational.
 */
export function useIntakePanel(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const importIntake = useSeasonStore((state) => state.importIntake);
  const runMatching = useSeasonStore((state) => state.runMatching);
  const resolveMatch = useSeasonStore((state) => state.resolveMatch);
  const discardName = useSeasonStore((state) => state.discardName);

  // 5. Derived State (useMemo)
  const unresolvedCount = useMemo(() => countUnresolved(seasonAnimes), [seasonAnimes]);

  // 6. Callbacks (useCallback calling the store)
  const onImport = useCallback(
    (rawText: string) => {
      void importIntake(source, rawText);
    },
    [importIntake, source],
  );
  const onRunMatching = useCallback(() => {
    void runMatching(source);
  }, [runMatching, source]);
  const onResolve = useCallback(
    (rowId: string, pageUrl: string) => {
      void resolveMatch(source, rowId, pageUrl);
    },
    [resolveMatch, source],
  );
  const onDiscard = useCallback(
    (rowId: string) => {
      void discardName(source, rowId);
    },
    [discardName, source],
  );

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  return {
    rows: seasonAnimes,
    unresolvedCount,
    errorMessage,
    onImport,
    onRunMatching,
    onResolve,
    onDiscard,
  };
}
