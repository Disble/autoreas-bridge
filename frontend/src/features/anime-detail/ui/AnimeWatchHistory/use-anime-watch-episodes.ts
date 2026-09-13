import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import type { AnimeWatchHistoryPageRequest, WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import type { AnimeWatchEpisodesState } from './anime-watch-history.types';

/** Builds the anime-scoped page request for the given anime, watch cycle, and keyset cursor (`cycle: 0` means every cycle). */
function buildEpisodesRequest(animeId: string, cycle: number, cursor: string): AnimeWatchHistoryPageRequest {
  return { animeId, cycle, cursor, limit: 0 };
}

/**
 * Drives the per-anime episode lists: accumulates keyset pages of one anime's
 * watch-history log by cursor, optionally scoped to a single watch cycle
 * (`cycle: 0` fetches every cycle, the All-episodes case). The `enabled` flag
 * gates the fetch so a collapsed Accordion item (U13) pays no binding call
 * until it expands; collapsing after loading keeps the accumulated rows, so
 * re-expanding is instant and spends no new call, while a new anime id or
 * cycle resets rows even while disabled so a collapsed item never shows
 * another scope's rows. A change to the anime id or cycle clears the
 * accumulated rows and mints a fresh generation, so a response from a now-superseded
 * request is dropped rather than appended to the new one. A first-page
 * failure surfaces as `error` (design D9); a later-page failure only stops
 * further paging, so it never erases rows already on screen. `fetchNextPage`
 * is guarded against a scroll burst re-firing before the in-flight page
 * resolves, which would otherwise fetch the same cursor twice and duplicate
 * rows. The two-argument `(animeId, source)` overload preserves the
 * pre-rename call shape for the unscoped default case.
 */
export function useAnimeWatchEpisodes(animeId: string, source?: BridgeRuntimeSource): AnimeWatchEpisodesState;
export function useAnimeWatchEpisodes(animeId: string, cycle?: number, enabled?: boolean, source?: BridgeRuntimeSource): AnimeWatchEpisodesState;
/** Implements both overloads: resolves the two-argument `(animeId, source)` shape to the default unscoped case (`cycle: 0`, still gated by `enabled`) and runs the paged fetch described above. */
export function useAnimeWatchEpisodes(
  animeId: string,
  cycleOrSource?: number | BridgeRuntimeSource,
  enabled = true,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): AnimeWatchEpisodesState {
  // 1. Refs
  const nextCursorRef = useRef<string | undefined>(undefined);
  /** Guards `fetchNextPage` against a scroll burst re-firing before the in-flight page resolves. */
  const isFetchingRef = useRef(false);
  /** Bumped whenever the anime id or cycle changes; a page response is applied only while its own generation is still current. */
  const generationRef = useRef(0);
  /** True once the gated fetch ran at least once; collapsing back to disabled keeps rows instead of clearing them. */
  const wasEnabledRef = useRef(false);
  /** Last fetch scope seen (undefined until the first effect run); a new scope resets rows even while disabled so a collapsed item never shows another scope's rows. */
  const lastFetchPageRef = useRef<((cursor: string, generation: number) => Promise<void>) | undefined>(undefined);
  const resolvedCycle = typeof cycleOrSource === 'number' ? cycleOrSource : 0;
  const resolvedSource = typeof cycleOrSource === 'object' ? cycleOrSource : source;

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const fetchPage = useCallback(
    async (cursor: string, generation: number) => {
      isFetchingRef.current = true;
      const result = await resolvedSource.getAnimeWatchHistoryPage?.(buildEpisodesRequest(animeId, resolvedCycle, cursor));

      if (generation !== generationRef.current) {
        // A newer request superseded this one while it was in flight; drop it.
        isFetchingRef.current = false;
        return;
      }

      const isFirstPage = cursor === '';

      if (result === undefined || result.status !== 'ok') {
        setHasMore(false);
        setIsLoading(false);
        if (isFirstPage) {
          setError(new Error(result?.message ?? 'Anime watch history request failed'));
        }
        isFetchingRef.current = false;
        return;
      }

      setEntries((current) => (isFirstPage ? result.items : [...current, ...result.items]));
      nextCursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== undefined);
      setIsLoading(false);
      if (isFirstPage) {
        setError(undefined);
      }
      isFetchingRef.current = false;
    },
    [animeId, resolvedCycle, resolvedSource],
  );

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore || nextCursorRef.current === undefined) {
      return;
    }

    void fetchPage(nextCursorRef.current, generationRef.current);
  }, [fetchPage, hasMore]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;

      if (!isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        return;
      }

      fetchNextPage();
    },
    [fetchNextPage],
  );

  // 7. Effects
  useEffect(() => {
    const scopeChanged = fetchPage !== lastFetchPageRef.current;
    lastFetchPageRef.current = fetchPage;

    if (!enabled && !scopeChanged && wasEnabledRef.current) {
      // Collapsed after loading within the same anime and cycle: keep the
      // accumulated rows so re-expanding is instant and spends no binding call.
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;

    nextCursorRef.current = undefined;
    setEntries([]);
    setHasMore(false);
    setError(undefined);

    if (!enabled) {
      // Gated off before ever loading, or on a new scope while collapsed:
      // stay idle without spending a binding call.
      setIsLoading(false);
      return;
    }

    wasEnabledRef.current = true;
    setIsLoading(true);
    void fetchPage('', generation);
  }, [enabled, fetchPage]);

  return { entries, isLoading, hasMore, error, fetchNextPage, onScroll };
}
