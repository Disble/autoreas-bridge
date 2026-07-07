import { useEffect, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { findSeasonCandidate } from './season-rate-action.helpers';

/**
 * useSeasonRateAction tells the Chapters card whether an anime is a gradeable
 * season candidate. It ensures the active season's candidates are loaded once
 * (deduped across the many cards) and selects the created candidate for this
 * anime. Grading itself flows through the shared RateAnimeModal.
 */
export function useSeasonRateAction(animeId: string, source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const ensureAnimesLoaded = useSeasonStore((state) => state.ensureAnimesLoaded);

  // 5. Derived State (useMemo)
  const candidate = useMemo(() => findSeasonCandidate(seasonAnimes, animeId), [seasonAnimes, animeId]);

  // 7. Effects
  useEffect(() => {
    void ensureAnimesLoaded(source);
  }, [ensureAnimesLoaded, source]);

  return { candidate };
}
