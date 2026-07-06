import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { groupCreatedBySection } from './daily-board.helpers';

/**
 * useDailyBoard drives the conveyor: created animes grouped by section, a
 * multi-select over the Sin ver pool to send today's batch to Ver hoy (which
 * downloads automatically), and an on-demand availability recheck. All Wails I/O
 * flows through the season store.
 */
export function useDailyBoard(source: SeasonSource = seasonSource) {
  // 2. State
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const sendToVerHoy = useSeasonStore((state) => state.sendToVerHoy);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);

  // 5. Derived State (useMemo)
  const sections = useMemo(() => groupCreatedBySection(seasonAnimes), [seasonAnimes]);

  // 6. Callbacks
  const toggleSelect = useCallback((animeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(animeId)) {
        next.delete(animeId);
      } else {
        next.add(animeId);
      }
      return next;
    });
  }, []);
  const onSendToVerHoy = useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];
    setSelected(new Set());
    void sendToVerHoy(source, ids);
  }, [selected, sendToVerHoy, source]);
  const onRecheck = useCallback(() => {
    void recheckAvailability(source);
  }, [recheckAvailability, source]);

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  return {
    sections,
    selected,
    toggleSelect,
    onSendToVerHoy,
    onRecheck,
    errorMessage,
  };
}
