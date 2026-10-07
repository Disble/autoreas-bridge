import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { SeasonCoverResult, SeasonCoverThumbProps } from './season-cover-thumb.types';

/**
 * Picks the anime ids whose covers still need a lookup: each non-empty id
 * once, skipping every id already requested. A row without an anime id has
 * nothing to resolve and keeps the placeholder.
 *
 * @param animeIds The ids a season list renders, in render order.
 * @param requested The ids a lookup was already started for.
 * @returns The ids to request now, in render order and without duplicates.
 */
export function planSeasonCoverRequests(animeIds: readonly string[], requested: ReadonlySet<string>): string[] {
  return [...new Set(animeIds)].filter((animeId) => animeId !== '' && !requested.has(animeId));
}

/**
 * Maps one `getAnimeCover` answer to its cache entry: a cover only when the
 * binding returned one with data, the placeholder otherwise.
 *
 * @param result The binding's answer.
 * @returns The cover entry to cache for that anime.
 */
export function toSeasonCoverEntry(result: SeasonCoverResult): AnimeCoverEntry {
  return result.source === 'cover' && result.dataUrl !== undefined ? { status: 'cover', dataUrl: result.dataUrl } : { status: 'placeholder' };
}

/**
 * Maps an anime's cached cover entry to the props its thumbnail renders. An id
 * with no entry yet renders the placeholder, never a skeleton.
 *
 * @param entry The cached entry, when a lookup was started for that anime.
 * @returns The thumbnail's source and loading flag.
 */
export function toSeasonCoverThumbProps(entry: AnimeCoverEntry | undefined): SeasonCoverThumbProps {
  return {
    coverSrc: entry?.status === 'cover' ? entry.dataUrl : undefined,
    isLoading: entry?.status === 'loading',
  };
}
