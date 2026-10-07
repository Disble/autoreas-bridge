import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import { planSeasonCoverRequests, toSeasonCoverEntry, toSeasonCoverThumbProps } from './season-cover-thumb.helpers';
import type { SeasonCoverSource, SeasonCoverThumbProps } from './season-cover-thumb.types';

/**
 * Resolves one cover per anime a season list renders, at most once per mount,
 * and hands back the lookup each row's thumbnail renders from.
 *
 * Mirrors `useEpisodeCovers`' fetch, degrade and placeholder shape. A season
 * row carries no stored-cover flag, so every non-empty id is asked once and the
 * binding itself answers "placeholder" for an anime without a cover. The ids
 * already asked live in a ref, so a re-render, a refreshed row list or a row
 * moving within the list never asks for the same anime again.
 *
 * @param animeIds The ids the list renders. Keep the array stable between
 * renders (memoize it), since a new array re-plans the requests.
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) degrades every requested id to the placeholder.
 * @returns The thumbnail props for an anime id.
 */
export function useSeasonCovers(animeIds: readonly string[], source: SeasonCoverSource): (animeId: string) => SeasonCoverThumbProps {
  // 1. Refs
  const requestedIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, AnimeCoverEntry>>(new Map());

  // 6. Callbacks (useCallback calling pure helpers)
  const getCoverThumb = useCallback((animeId: string) => toSeasonCoverThumbProps(covers.get(animeId)), [covers]);

  // 7. Effects
  useEffect(() => {
    const requests = planSeasonCoverRequests(animeIds, requestedIdsRef.current);

    if (requests.length === 0) {
      return;
    }

    for (const animeId of requests) {
      requestedIdsRef.current.add(animeId);
    }

    const getAnimeCover = source.getAnimeCover;

    // No binding (a non-Wails context): leave the ids uncached, which renders
    // the placeholder.
    if (getAnimeCover === undefined) {
      return;
    }

    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Cover entries are async fetch state keyed by the list's rows, so the cache must update when new rows arrive.
    setCovers((previous) => withCoverEntries(previous, requests, { status: 'loading' }));

    for (const animeId of requests) {
      void getAnimeCover(animeId)
        .then((result) => {
          setCovers((previous) => withCoverEntries(previous, [animeId], toSeasonCoverEntry(result)));
        })
        .catch(() => {
          // A failed lookup drops its pending entry; an uncached id renders the placeholder.
          setCovers((previous) => withoutCoverEntry(previous, animeId));
        });
    }
  }, [animeIds, source]);

  return getCoverThumb;
}

/**
 * Returns a copy of the cover cache with the given ids set to one entry. A new
 * Map every time because the cache is state: mutating the existing one would
 * leave React comparing an object with itself and skipping the render.
 *
 * @param previous The cache being replaced.
 * @param animeIds The ids whose entry changes.
 * @param entry The entry to store for each of them.
 * @returns The updated cache.
 */
function withCoverEntries(
  previous: ReadonlyMap<string, AnimeCoverEntry>,
  animeIds: readonly string[],
  entry: AnimeCoverEntry,
): ReadonlyMap<string, AnimeCoverEntry> {
  return new Map([...previous, ...animeIds.map((animeId): [string, AnimeCoverEntry] => [animeId, entry])]);
}

/**
 * Returns a copy of the cover cache without one anime's entry, so that anime
 * renders the placeholder again.
 *
 * @param previous The cache being replaced.
 * @param animeId The anime whose entry is dropped.
 * @returns The updated cache.
 */
function withoutCoverEntry(previous: ReadonlyMap<string, AnimeCoverEntry>, animeId: string): ReadonlyMap<string, AnimeCoverEntry> {
  return new Map([...previous].filter(([cachedId]) => cachedId !== animeId));
}
