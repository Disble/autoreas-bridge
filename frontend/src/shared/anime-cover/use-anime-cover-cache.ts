import { useEffect, useRef, useState } from 'react';
import { planAnimeCoverRequests, toAnimeCoverEntry } from './anime-cover.helpers';
import type { AnimeCoverSource } from './anime-cover.types';
import type { AnimeCoverEntry } from './use-anime-cover';

/**
 * Resolves one cover per anime a list renders, at most once per mount, and
 * hands back the cache each row renders from.
 *
 * Mirrors `useEpisodeCovers`' fetch, degrade and placeholder shape. The ids
 * already asked live in a ref, so a re-render, a refreshed row list or a row
 * moving within the list never asks for the same anime again. Callers gate the
 * ids themselves (a progressive window, a stored-cover flag); every id passed
 * is asked once and the binding answers "placeholder" for an anime without a
 * cover.
 *
 * @param animeIds The ids to resolve. Keep the array stable between renders
 * (memoize it), since a new array re-plans the requests.
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) leaves every id uncached.
 * @returns The cover entry per requested id. An id with no entry has not been
 * asked, has no binding to ask, or its lookup failed.
 */
export function useAnimeCoverCache(animeIds: readonly string[], source: AnimeCoverSource): ReadonlyMap<string, AnimeCoverEntry> {
  // 1. Refs
  const requestedIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, AnimeCoverEntry>>(new Map());

  // 7. Effects
  useEffect(() => {
    const requests = planAnimeCoverRequests(animeIds, requestedIdsRef.current);

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
          setCovers((previous) => withCoverEntries(previous, [animeId], toAnimeCoverEntry(result)));
        })
        .catch(() => {
          // A failed lookup drops its pending entry; an uncached id renders the placeholder.
          setCovers((previous) => withoutCoverEntry(previous, animeId));
        });
    }
  }, [animeIds, source]);

  return covers;
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
