import { useCallback, useEffect, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { groupDailyBoard } from './daily-board.helpers';

/**
 * useDailyBoard loads the season intake rows on mount and exposes them grouped
 * by actionability, plus the stage-move and recheck callbacks. All Wails I/O
 * flows through the season store; DailyBoard.tsx is purely presentational.
 */
export function useDailyBoard(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const setAnimeDays = useSeasonStore((state) => state.setAnimeDays);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);

  // 5. Derived State (useMemo)
  const groups = useMemo(() => groupDailyBoard(seasonAnimes), [seasonAnimes]);

  // 6. Callbacks (useCallback calling the store)
  const onMove = useCallback(
    (animeId: string, section: string) => {
      void setAnimeDays(source, animeId, [section]);
    },
    [setAnimeDays, source],
  );
  const onRecheck = useCallback(() => {
    void recheckAvailability(source);
  }, [recheckAvailability, source]);

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  return {
    groups,
    errorMessage,
    onMove,
    onRecheck,
  };
}
