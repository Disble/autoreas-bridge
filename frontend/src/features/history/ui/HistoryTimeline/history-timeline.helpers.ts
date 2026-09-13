import type { Anime } from '../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';

/**
 * Resolves which animes an active Status/Type filter narrows the history
 * read to (design D2). Status and Type filter by the anime's CURRENT
 * catalog state, never the state recorded at watch time.
 * @param catalog The full anime catalog, loaded once per History visit.
 * @param status The active Status filter, or `undefined` for "All".
 * @param type The active Type filter, or `undefined` for "All".
 * @returns `'all'` when neither filter narrows; `'ids'` with the matching
 * set when at least one anime matches; `'none'` when the filter matches
 * nothing -- the caller must render the filtered-empty state and skip the
 * watch-history read entirely.
 */
export function resolveHistoryAnimeScope(
  catalog: readonly Anime[],
  status: number | undefined,
  type: number | undefined,
): HistoryAnimeScope {
  if (status === undefined && type === undefined) {
    return { kind: 'all' };
  }

  const ids = catalog
    .filter((anime) => (status === undefined || anime.status === status) && (type === undefined || anime.kind === type))
    .map((anime) => anime.id);

  return ids.length === 0 ? { kind: 'none' } : { kind: 'ids', ids };
}
