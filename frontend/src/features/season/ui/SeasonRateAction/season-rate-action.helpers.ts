import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';

/**
 * findSeasonCandidate returns the active season's CREATED row linked to the given
 * anime id, or undefined when the anime is not a season candidate. Only created
 * candidates (an anime exists and is linked) can be graded from the Episodes card.
 */
export function findSeasonCandidate(
  rows: readonly SeasonAnimeRow[],
  animeId: string,
): SeasonAnimeRow | undefined {
  return rows.find((r) => r.availability === 'created' && r.animeId === animeId);
}
