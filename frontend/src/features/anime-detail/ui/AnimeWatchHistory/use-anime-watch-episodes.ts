import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import type { AnimeSource } from '../../../../shared/contracts/anime-source.types';
import type { AnimeWatchHistoryPageRequest, WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { animeKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { buildAnimeWatchEpisodesRequest, toAnimeWatchEpisodePages } from './anime-watch-history.helpers';
import type { AnimeWatchEpisodesState, AnimeWatchOlderPages } from './anime-watch-history.types';

/**
 * Drives the per-anime episode lists: reads keyset pages of one anime's
 * watch-history log, optionally scoped to a single watch cycle (`cycle: 0`
 * reads every cycle, the All-episodes case). The first page is a
 * `useBridgeQuery` on the `anime` module keyed by anime and cycle, so it stays
 * loading while the module starts and another scope's rows never show for this
 * one. The `enabled` flag gates the read so a collapsed Accordion item (U13)
 * pays no binding call until it expands; collapsing after loading keeps the
 * loaded rows, and re-expanding reads the first page again. Older pages load
 * through the cursor and belong to one scope and one first-page load; a
 * response for a superseded scope is dropped. A first-page failure surfaces
 * as `error` (design D9); a later-page failure only stops further paging, so
 * it never erases rows already on screen. `fetchNextPage` is guarded against a
 * scroll burst re-firing before the in-flight page resolves, which would
 * otherwise fetch the same cursor twice. The two-argument `(animeId, source)`
 * overload preserves the pre-rename call shape for the unscoped default case.
 */
export function useAnimeWatchEpisodes(animeId: string, source?: AnimeSource): AnimeWatchEpisodesState;
export function useAnimeWatchEpisodes(animeId: string, cycle?: number, enabled?: boolean, source?: AnimeSource): AnimeWatchEpisodesState;
/** Implements both overloads: resolves the two-argument `(animeId, source)` shape to the default unscoped case (`cycle: 0`, still gated by `enabled`) and runs the paged read described above. */
export function useAnimeWatchEpisodes(
  animeId: string,
  cycleOrSource?: number | AnimeSource,
  enabled = true,
  source: AnimeSource = BRIDGE_ANIME_SOURCE,
): AnimeWatchEpisodesState {
  // 1. Refs
  /** The scope the latest render shows; an older page for another scope is dropped. */
  const requestKeyRef = useRef<string | undefined>(undefined);
  /** The in-flight older-page read, so a scroll burst never fetches the same cursor twice. */
  const inFlightRef = useRef<object | undefined>(undefined);
  const resolvedCycle = typeof cycleOrSource === 'number' ? cycleOrSource : 0;
  const resolvedSource = typeof cycleOrSource === 'object' ? cycleOrSource : source;

  // 2. State
  const [older, setOlder] = useState<AnimeWatchOlderPages | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const firstRequest = buildAnimeWatchEpisodesRequest(animeId, resolvedCycle, '');
  const firstPage = useBridgeQuery({
    queryKey: animeKeys.key('anime-watch-history', firstRequest),
    queryFn: () => resolvedSource.getAnimeWatchHistoryPage(firstRequest),
    module: 'anime',
    enabled,
  });

  // 5. Derived State (useMemo)
  const requestKey = JSON.stringify(firstRequest);
  const pages = toAnimeWatchEpisodePages({ isEnabled: enabled, firstPage, older, requestKey });

  // 6. Callbacks (useCallback calling pure helpers)
  const loadOlderPage = useCallback(
    (request: AnimeWatchHistoryPageRequest, key: string, firstPageAt: number, entries: readonly WatchHistoryEntry[], cursor: string) => {
      const read = {};
      inFlightRef.current = read;
      resolvedSource
        .getAnimeWatchHistoryPage({ ...request, cursor })
        .then(
          (page) => ({ entries: [...entries, ...page.items], nextCursor: page.nextCursor }),
          () => ({ entries, nextCursor: undefined }),
        )
        .then((next) => {
          if (requestKeyRef.current === key) {
            setOlder({ requestKey: key, firstPageAt, ...next });
          }
        })
        .finally(() => {
          if (inFlightRef.current === read) {
            inFlightRef.current = undefined;
          }
        });
    },
    [resolvedSource],
  );

  const fetchNextPage = useCallback(() => {
    if (inFlightRef.current !== undefined || pages.cursor === undefined) {
      return;
    }

    loadOlderPage(firstRequest, requestKey, firstPage.dataUpdatedAt, pages.entries, pages.cursor);
  }, [firstPage.dataUpdatedAt, firstRequest, loadOlderPage, pages.cursor, pages.entries, requestKey]);

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
    requestKeyRef.current = requestKey;
  }, [requestKey]);

  return { entries: pages.entries, isLoading: pages.isLoading, hasMore: pages.cursor !== undefined, error: pages.error, fetchNextPage, onScroll };
}
