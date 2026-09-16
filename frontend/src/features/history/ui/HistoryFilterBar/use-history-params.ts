import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { WatchHistoryOrder } from '../../../../shared/contracts/anime.types';
import { parseHistoryParams, serializeHistoryParams } from './history-params.helpers';
import type { HistoryDateRange, HistoryParams } from './history-filter-bar.types';

/** Push/replace writers `useHistoryParams` exposes for each URL-backed field (design D5's write-mode table). */
export interface UseHistoryParamsResult {
  /** The current `/history` filter and selection state, decoded from the URL. */
  readonly params: HistoryParams;
  /** Writes `search` via replace; the caller (a later unit's debounced draft) decides when to call it. */
  readonly setSearch: (search: string) => void;
  /** Writes `status` via push, or clears it back to All when `undefined`. */
  readonly setStatus: (status: number | undefined) => void;
  /** Writes `type` via push, or clears it back to All when `undefined`. */
  readonly setType: (type: number | undefined) => void;
  /** Writes the watched range via push, or clears it when `undefined`. */
  readonly setRange: (range: HistoryDateRange | undefined) => void;
  /** Writes `order` (the Sort control) via push. */
  readonly setSort: (order: WatchHistoryOrder) => void;
  /** Writes `animeId`/`rowId` together via replace (design D5). */
  readonly setSelection: (animeId: string | undefined, rowId: number | undefined) => void;
}

/**
 * Thin adapter over `useSearchParams` for `/history` (design D5): decodes
 * the current URL once per change into `HistoryParams`, and exposes one
 * push/replace writer per field. Every writer merges its patch onto the
 * CURRENTLY COMMITTED URL via `setSearchParams`'s functional form, so a
 * replace write built from a stale render (a debounced search resolving
 * late) can never clobber a push write (a filter change) that landed after
 * it -- both always read the same live `prev`, never a value captured at
 * render time.
 */
export function useHistoryParams(): UseHistoryParamsResult {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const [searchParams, setSearchParams] = useSearchParams();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const params = useMemo(() => parseHistoryParams(searchParams), [searchParams]);

  // 6. Callbacks (useCallback calling pure helpers)
  const write = useCallback(
    (patch: Partial<HistoryParams>, replace: boolean) => {
      setSearchParams((prev) => serializeHistoryParams({ ...parseHistoryParams(prev), ...patch }), { replace });
    },
    [setSearchParams],
  );
  const setSearch = useCallback((search: string) => write({ search }, true), [write]);
  const setStatus = useCallback((status: number | undefined) => write({ status }, false), [write]);
  const setType = useCallback((type: number | undefined) => write({ type }, false), [write]);
  const setRange = useCallback((range: HistoryDateRange | undefined) => write({ range }, false), [write]);
  const setSort = useCallback((order: WatchHistoryOrder) => write({ order }, false), [write]);
  const setSelection = useCallback(
    (animeId: string | undefined, rowId: number | undefined) => write({ animeId, rowId }, true),
    [write],
  );

  // 7. Effects

  return { params, setSearch, setStatus, setType, setRange, setSort, setSelection };
}
