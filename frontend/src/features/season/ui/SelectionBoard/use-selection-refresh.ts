import { useEffect } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';

/**
 * useSelectionRefresh loads the season snapshot and its rows once per source and
 * on a source change. It owns no state: the store holds the result and every
 * selector reads it back, which keeps the load out of the hooks that derive.
 *
 * @param source The season port the store reads through.
 */
export function useSelectionRefresh(source: SeasonSource): void {
  const refresh = useSeasonStore((state) => state.refresh);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);

  useEffect(() => {
    void refresh(source);
    void refreshAnimes(source);
  }, [refresh, refreshAnimes, source]);
}
