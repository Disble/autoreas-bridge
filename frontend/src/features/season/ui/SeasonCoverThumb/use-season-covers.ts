import { useCallback } from 'react';
import { useAnimeCoverCache } from '../../../../shared/anime-cover/use-anime-cover-cache';
import { toSeasonCoverThumbProps } from './season-cover-thumb.helpers';
import type { SeasonCoverSource, SeasonCoverThumbProps } from './season-cover-thumb.types';

/**
 * Resolves one cover per anime a season list renders, at most once per mount,
 * and hands back the lookup each row's thumbnail renders from.
 *
 * A season row carries no stored-cover flag, so every non-empty id is asked
 * once through the shared `useAnimeCoverCache` and the binding itself answers
 * "placeholder" for an anime without a cover.
 *
 * @param animeIds The ids the list renders. Keep the array stable between
 * renders (memoize it), since a new array re-plans the requests.
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) degrades every requested id to the placeholder.
 * @returns The thumbnail props for an anime id.
 */
export function useSeasonCovers(animeIds: readonly string[], source: SeasonCoverSource): (animeId: string) => SeasonCoverThumbProps {
  // 3. Context/3rd Party Hooks
  const covers = useAnimeCoverCache(animeIds, source);

  // 6. Callbacks (useCallback calling pure helpers)
  return useCallback((animeId: string) => toSeasonCoverThumbProps(covers.get(animeId)), [covers]);
}
