import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';

/**
 * useRateAnimeModal drives the shared grade-capture modal: picking a 1–6 grade
 * records a MANUAL grade for the anime through the season store (optimistic, with
 * rollback on failure). All Wails I/O flows through the store.
 */
export function useRateAnimeModal(animeId: string, source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const setGrade = useSeasonStore((state) => state.setGrade);

  // 6. Callbacks
  const onSelectGrade = useCallback(
    (grade: number) => {
      void setGrade(source, animeId, grade);
    },
    [setGrade, source, animeId],
  );

  return { onSelectGrade };
}
