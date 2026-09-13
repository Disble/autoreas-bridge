import { useEffect, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import type { AnimeWatchHistoryState } from './anime-watch-history.types';

/**
 * Drives AnimeWatchHistory: fetches the given anime's most recent
 * watch-history page on mount and whenever its id changes (watch-history
 * spec, "Per-Anime History Surfaces On Anime Detail"). Never fetches a
 * further page itself -- the backend still caps page size, so `hasMore`
 * tells the caller whether older rows exist beyond this one page. Ignores a
 * request that resolves after the animeId has already moved on (mirrors
 * useAnimeDetail's stale-fetch guard), so a slow response for a previous
 * anime can never overwrite the current one's result. A missing binding or a
 * non-"ok" status both surface as `error`, never as a silent empty result
 * (design D9).
 */
export function useAnimeWatchHistory(
  animeId: string,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): AnimeWatchHistoryState {
  // 1. Refs

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks

  // 7. Effects
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    async function fetchPage() {
      const result = await source.getAnimeWatchHistoryPage?.(animeId, '');

      if (!active) {
        return;
      }

      if (result === undefined || result.status !== 'ok') {
        setEntries([]);
        setHasMore(false);
        setError(new Error(result?.message ?? 'Anime watch history request failed'));
        setIsLoading(false);
        return;
      }

      setEntries(result.items);
      setHasMore(result.nextCursor !== undefined);
      setError(undefined);
      setIsLoading(false);
    }

    void fetchPage();

    return () => {
      active = false;
    };
  }, [animeId, source]);

  return { entries, isLoading, hasMore, error };
}
