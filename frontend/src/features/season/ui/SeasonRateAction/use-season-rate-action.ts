import { useMemo } from 'react';
import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_ENSURE_BANNER } from '../../../../shared/season/season.constants';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';
import { findSeasonCandidate } from './season-rate-action.helpers';

/**
 * useSeasonRateAction tells the Episodes card whether an anime is a gradeable
 * season candidate. It loads the active season's candidates once per session
 * (one read shared by the many cards) and selects the created candidate for
 * this anime. Grading itself flows through the shared RateAnimeModal.
 *
 * A candidate is offered only while the displayed season is open, resolved
 * through the shared `isSeasonOpen` predicate: a closed historical season viewed
 * read-only keeps its created rows ungradeable. The hook reads the season from
 * the cache only, so a fresh Today-first start stays without a rating action
 * until the Season route loaded the season.
 * @param animeId The anime shown on the card.
 * @param source The port the reads go through; the runtime adapter by default.
 * @returns The card's season candidate, if any.
 */
export function useSeasonRateAction(animeId: string, source: SeasonQuerySource = BRIDGE_SEASON_SOURCE) {
  // 4. Queries/Mutations
  const { data: season } = useDisplayedSeason({ refresh: 'never', source });
  const animesQuery = useDisplayedSeasonAnimes({ refresh: 'once', source });

  // 5. Derived State (useMemo)
  const isOpen = isSeasonOpen(season ?? null);
  const seasonAnimes = animesQuery.data;
  const candidate = useMemo(
    () => (isOpen && seasonAnimes !== undefined ? findSeasonCandidate(seasonAnimes, animeId) : undefined),
    [animeId, isOpen, seasonAnimes],
  );

  // 7. Effects
  useSeasonBannerSync(animesQuery, SEASON_ANIMES_ENSURE_BANNER);

  return { candidate };
}
