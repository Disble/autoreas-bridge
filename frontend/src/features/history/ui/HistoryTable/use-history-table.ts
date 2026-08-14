import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeHistoryEntry } from '../../../../shared/contracts/anime.types';
import { useAsyncList } from '../../../../shared/hooks/use-async-list/use-async-list';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import {
  HISTORY_TABLE_ESTADO_OPTIONS,
  HISTORY_TABLE_SEARCH_DEBOUNCE_MS,
  HISTORY_TABLE_SORT_OPTIONS,
  HISTORY_TABLE_TIPO_OPTIONS,
} from './history-table.constants';
import { parseHistoryParams } from './history-table.helpers';
import type { HistoryTableProps, HistoryTableState } from './history-table.types';
import { useHistoryParamsWriters } from './use-history-params-writers';
import { useHistoryRows } from './use-history-rows';

/**
 * Drives HistoryTable: fetches the full server-sorted History list with a
 * single `getAnimeHistory` call (no per-item detail fetch -- the read model
 * already carries every column the table needs), then applies debounced
 * name search, estado/tipo filters, sort, and pagination entirely
 * client-side over that list (design Decision 2). Search, estado, tipo,
 * sort, and page are persisted in the `/history` URL query string (design
 * D2) via `useSearchParams`, so drilling into a detail and coming back
 * restores the exact prior view. Every exposed callback is a client-side
 * state setter; History is read-only, so none of them trigger a
 * write/patch/reconcile call against the bridge.
 */
export function useHistoryTable(
  _props: Readonly<HistoryTableProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryTableState {
  // 1. Refs

  // 2. State
  // 3. Context/3rd Party Hooks
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseHistoryParams(searchParams), [searchParams]);
  const [searchQuery, setSearchQuery] = useState(urlState.q);

  // 4. Queries/Mutations
  const { items: entries, isLoading } = useAsyncList<AnimeHistoryEntry>(() => source.getAnimeHistory(), source);

  // 5. Derived State (useMemo)
  const debouncedQuery = useDebounce(searchQuery, HISTORY_TABLE_SEARCH_DEBOUNCE_MS);
  const { estado: estadoFilter, tipo: tipoFilter, sort: sortOrder, page } = urlState;
  const { rows, totalPages, currentPage, isEmpty, pageItems } = useHistoryRows({
    entries, debouncedQuery, estadoFilter, tipoFilter, sortOrder, page, isLoading,
  });

  // 6. Callbacks (useCallback calling pure helpers)
  const { writeParams, onEstadoFilterChange, onTipoFilterChange, onSortOrderChange, onPageChange } = useHistoryParamsWriters({
    // `q` is the debounced value, not `urlState.q`: a write must carry the
    // search the user has settled on, not the one still in the URL.
    current: { q: debouncedQuery, estado: estadoFilter, tipo: tipoFilter, sort: sortOrder, page },
    totalPages,
    setSearchParams,
  });
  const onSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // 7. Effects
  useEffect(() => {
    if (debouncedQuery === urlState.q) {
      return;
    }

    writeParams({ q: debouncedQuery, page: 1 }, { replace: true });
    // Only the debounced value (not urlState.q or writeParams) should retrigger this write --
    // urlState.q changes as a RESULT of this effect, and including it would fight the write.
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [debouncedQuery]);

  return {
    rows,
    isLoading,
    isEmpty,
    searchQuery,
    estadoFilter,
    estadoOptions: HISTORY_TABLE_ESTADO_OPTIONS,
    tipoFilter,
    tipoOptions: HISTORY_TABLE_TIPO_OPTIONS,
    sortOrder,
    sortOptions: HISTORY_TABLE_SORT_OPTIONS,
    page: currentPage,
    totalPages,
    pageItems,
    onSearchQueryChange,
    onEstadoFilterChange,
    onTipoFilterChange,
    onSortOrderChange,
    onPageChange,
  };
}
