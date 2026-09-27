import { useEffect, useMemo } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { findSeasonCandidate } from './season-rate-action.helpers';

/**
 * useSeasonRateAction tells the Episodes card whether an anime is a gradeable
 * season candidate. It ensures the active season's candidates are loaded once
 * (deduped across the many cards) and selects the created candidate for this
 * anime. Grading itself flows through the shared RateAnimeModal.
 *
 * A candidate is offered only while the store's loaded season is open, resolved
 * through the shared `isSeasonOpen` predicate: after `viewPastSeason` the store
 * holds a closed historical season whose created rows must stay ungradeable. The
 * hook deliberately does not fetch the season itself, so a fresh Today-first start
 * stays without a rating action until the Season route hydrates the store.
 */
export function useSeasonRateAction(animeId: string, source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const season = useSeasonStore((state) => state.season);
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const ensureAnimesLoaded = useSeasonStore((state) => state.ensureAnimesLoaded);

  // 5. Derived State (useMemo)
  const isOpen = isSeasonOpen(season);
  const candidate = useMemo(
    () => (isOpen ? findSeasonCandidate(seasonAnimes, animeId) : undefined),
    [animeId, isOpen, seasonAnimes],
  );

  // 7. Effects
  useEffect(() => {
    void ensureAnimesLoaded(source);
  }, [ensureAnimesLoaded, source]);

  return { candidate };
}
