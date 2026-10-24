import { useEffect, useRef, useState } from 'react';
import type { RunHistoryNameSource } from './run-history-panel.types';

/**
 * Asks the catalog for the name of each anime an older run left unnamed, at
 * most once per mount, the same way `useAnimeCoverCache` asks for covers.
 *
 * @param animeIds The ids to name. Keep the array stable between renders
 * (memoize it), since a new array re-plans the requests.
 * @param source The port `getAnimeDetail` is called through.
 * @returns The answer per id: the catalog name, or `null` when the anime is
 * gone, its read failed or there is no binding to ask. An id with no entry is
 * still loading.
 */
export function useAnimeNameCache(animeIds: readonly string[], source: RunHistoryNameSource): ReadonlyMap<string, string | null> {
  // 1. Refs
  const requestedIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [names, setNames] = useState<ReadonlyMap<string, string | null>>(new Map());

  // 7. Effects
  useEffect(() => {
    const requests = animeIds.filter((animeId) => !requestedIdsRef.current.has(animeId));

    if (requests.length === 0) {
      return;
    }

    for (const animeId of requests) {
      requestedIdsRef.current.add(animeId);
    }

    const getAnimeDetail = source.getAnimeDetail;

    // No binding (a non-Wails context): settle every id on its fallback name
    // instead of leaving a skeleton that never resolves.
    if (getAnimeDetail === undefined) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Name entries are async fetch state keyed by the detail's rows, so the cache must update when new rows arrive.
      setNames((previous) => withNameEntries(previous, requests.map((animeId) => [animeId, null])));
      return;
    }

    for (const animeId of requests) {
      void getAnimeDetail(animeId)
        .then((anime) => {
          setNames((previous) => withNameEntries(previous, [[animeId, anime?.name || null]]));
        })
        .catch(() => {
          setNames((previous) => withNameEntries(previous, [[animeId, null]]));
        });
    }
  }, [animeIds, source]);

  return names;
}

/**
 * Returns a copy of the name cache with the given answers set. A new Map every
 * time because the cache is state.
 *
 * @param previous The cache being replaced.
 * @param entries The answers to store, per id.
 * @returns The updated cache.
 */
function withNameEntries(
  previous: ReadonlyMap<string, string | null>,
  entries: readonly (readonly [string, string | null])[],
): ReadonlyMap<string, string | null> {
  return new Map([...previous, ...entries]);
}
