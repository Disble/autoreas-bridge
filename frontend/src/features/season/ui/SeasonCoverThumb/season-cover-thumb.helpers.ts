import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { SeasonCoverThumbProps } from './season-cover-thumb.types';

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
