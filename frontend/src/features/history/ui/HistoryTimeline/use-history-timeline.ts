import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import type { WatchHistoryEntry, WatchHistoryPageRequest } from '../../../../shared/contracts/anime.types';
import { groupEntriesByDay } from '../../../../shared/watch-history/watch-history.helpers';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';
import { toLocalDayRangeMs } from '../HistoryFilterBar/history-params.helpers';
import { toHistoryTimelineGroups } from './history-timeline.helpers';
import { useHistoryAnimeScope } from './use-history-anime-scope';
import type { HistoryTimelineFilters, HistoryTimelineState } from './history-timeline.types';

/**
 * Builds the page request for the given filters and Status/Type scope (design
 * D2, D4): an `'ids'` scope narrows the read to that anime set; `'all'` and
 * `'none'` both send an empty `animeIds` -- `'none'` is never actually sent,
 * since its caller short-circuits before fetching. The watched range goes out
 * as half-open local-day millis, `0`/`0` when unbounded.
 */
function buildPageRequest(filters: HistoryTimelineFilters, scope: HistoryAnimeScope, cursor: string): WatchHistoryPageRequest {
  const [watchedFromMs, watchedToMs] = filters.range === undefined ? [0, 0] : toLocalDayRangeMs(filters.range.from, filters.range.to);

  return {
    search: filters.search,
    animeIds: scope.kind === 'ids' ? scope.ids : [],
    watchedFromMs,
    watchedToMs,
    order: filters.order,
    cursor,
    limit: 0,
  };
}

/**
 * Identifies one logical request independent of its cursor (design D6): the
 * JSON of every filter. Two calls with the same key page the SAME
 * request, so accumulated rows survive; a changed key means the request
 * itself changed and the accumulated rows must be discarded. Built from the
 * raw filter inputs rather than the resolved `HistoryAnimeScope`, so an
 * `'all'` scope (no filter) and a `'none'` scope (a filter matching nothing)
 * -- which both resolve to an empty `animeIds` -- are never mistaken for the
 * same request.
 */
function buildRequestKey({ order, range, search, status, type }: HistoryTimelineFilters): string {
  return JSON.stringify({ order, range, search, status, type });
}

/**
 * Drives HistoryTimeline: accumulates keyset pages of the global watch-history
 * log by cursor and groups the accumulated rows by local calendar day (Anime
 * History spec, "Episode Timeline Is Grouped By Day"). Loads the anime
 * catalog via `getAnimes()` once per visit (design D2) and resolves the
 * active Status/Type filter against it before the first page fetch: a scope
 * of `'none'` renders the filtered-empty state without spending a binding
 * call. Fetches the first page once the catalog has loaded, and again
 * whenever a filter changes; `onScroll` fetches the next
 * page on a near-bottom scroll (design D5a) -- deliberately does NOT use
 * `useProgressiveListWindow`: the server page IS the batch, so a client-side
 * render-limit window would only fight the accumulated page state.
 *
 * A change to the request key (design D6) clears the accumulated rows, sets
 * `isLoading`, and mints a fresh generation so a response from a
 * now-superseded request is dropped rather than appended to the new one.
 * `isLoading` covers both the catalog load and the first page (CLAUDE.md FE
 * #14). A first-page failure surfaces as `error` (design D9); a later-page
 * failure only stops further paging, so it never erases rows already on
 * screen. `fetchNextPage` is guarded against a scroll burst re-firing before
 * the in-flight page resolves, which would otherwise fetch the same cursor
 * twice and duplicate rows.
 */
export function useHistoryTimeline(
  filters: HistoryTimelineFilters,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryTimelineState {
  // 1. Refs
  const nextCursorRef = useRef<string | undefined>(undefined);
  /** Guards `fetchNextPage` against a scroll burst re-firing before the in-flight page resolves. */
  const isFetchingRef = useRef(false);
  /** Bumped whenever the request key changes; a page response is applied only while its own generation is still current (design D6). */
  const generationRef = useRef(0);

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  /** Catalog resolution gates the first page and supplies row status chips (design D2). */
  const { catalog, error: catalogError, scope } = useHistoryAnimeScope(filters.status, filters.type, source);

  // 4. Queries/Mutations
  const fetchPage = useCallback(
    async (cursor: string, generation: number, scope: HistoryAnimeScope) => {
      isFetchingRef.current = true;
      const result = await source.getWatchHistoryPage?.(buildPageRequest(filters, scope, cursor));

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
          setError(new Error(result?.message ?? 'Watch history request failed'));
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
    [source, filters],
  );

  // 5. Derived State (useMemo)
  const groups = useMemo(
    () => (catalog === undefined ? [] : toHistoryTimelineGroups(groupEntriesByDay(entries), catalog)),
    [catalog, entries],
  );
  /** `undefined` until `scope` resolves, so the reset effect below stays inert until then. */
  const requestKey = scope === undefined ? undefined : buildRequestKey(filters);

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore || nextCursorRef.current === undefined || scope === undefined) {
      return;
    }

    void fetchPage(nextCursorRef.current, generationRef.current, scope);
  }, [fetchPage, hasMore, scope]);

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
    if (catalogError !== undefined) {
      generationRef.current += 1;
      nextCursorRef.current = undefined;
      setEntries([]);
      setHasMore(false);
      setError(catalogError);
      setIsLoading(false);
      return;
    }

    if (requestKey === undefined || scope === undefined) {
      // The catalog has not resolved yet; stay in the initial loading state.
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;

    nextCursorRef.current = undefined;
    setEntries([]);
    setHasMore(false);
    setError(undefined);

    if (scope.kind === 'none') {
      // The Status/Type filter matches nothing in the catalog (design D2):
      // render the filtered-empty state without spending a binding call.
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void fetchPage('', generation, scope);
    // `fetchPage` is intentionally NOT listed: it also changes identity when
    // only `source` or the `filters` object identity changes, which must not,
    // by itself, reset an unrelated request. `requestKey` -- the JSON of
    // every filter (design D6) -- is the one true trigger; `scope`
    // is read, not depended on, because it is derived from the same
    // `status`/`type` in the same render as `requestKey`, so it is never
    // stale when this effect's own render committed.
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [catalogError, requestKey]);

  return { groups, isLoading, hasMore, error, fetchNextPage, onScroll };
}
