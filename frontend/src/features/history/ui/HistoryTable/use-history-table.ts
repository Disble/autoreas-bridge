import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { AnimeHistoryEntry } from '../../../../shared/contracts/anime.types';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import {
  HISTORY_TABLE_ESTADO_ALL_VALUE,
  HISTORY_TABLE_ESTADO_OPTIONS,
  HISTORY_TABLE_PAGE_SIZE,
  HISTORY_TABLE_SEARCH_DEBOUNCE_MS,
} from './history-table.constants';
import {
  filterHistoryEntries,
  getHistoryPageItems,
  getHistoryTotalPages,
  paginateHistoryEntries,
} from './history-table.helpers';
import type { HistoryTableProps, HistoryTableState } from './history-table.types';

/**
 * Drives HistoryTable: fetches the full server-sorted History list with a
 * single `getAnimeHistory` call (no per-item detail fetch -- the read model
 * already carries every column the table needs), then applies debounced
 * name search, estado filter, and pagination entirely client-side over that
 * list (design Decision 2). Every exposed callback is a client-side state
 * setter; History is read-only, so none of them trigger a
 * write/patch/reconcile call against the bridge.
 */
export function useHistoryTable(
  _props: Readonly<HistoryTableProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryTableState {
  // 1. Refs

  // 2. State
  const [entries, setEntries] = useState<readonly AnimeHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFilter, setEstadoFilter] = useState(HISTORY_TABLE_ESTADO_ALL_VALUE);
  const [page, setPage] = useState(1);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const debouncedQuery = useDebounce(searchQuery, HISTORY_TABLE_SEARCH_DEBOUNCE_MS);
  const filteredEntries = useMemo(
    () => filterHistoryEntries(entries, debouncedQuery, estadoFilter),
    [entries, debouncedQuery, estadoFilter],
  );
  const totalPages = useMemo(
    () => getHistoryTotalPages(filteredEntries.length, HISTORY_TABLE_PAGE_SIZE),
    [filteredEntries.length],
  );
  const currentPage = Math.min(page, totalPages);
  const rows = useMemo(
    () => paginateHistoryEntries(filteredEntries, currentPage, HISTORY_TABLE_PAGE_SIZE),
    [filteredEntries, currentPage],
  );
  const isEmpty = useMemo(() => !isLoading && filteredEntries.length === 0, [isLoading, filteredEntries.length]);
  const pageItems = useMemo(() => getHistoryPageItems(currentPage, totalPages), [currentPage, totalPages]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);
  const onEstadoFilterChange = useCallback((estado: string) => {
    setEstadoFilter(estado);
  }, []);
  const onPageChange = useCallback(
    (nextPage: number) => {
      setPage(Math.min(Math.max(nextPage, 1), totalPages));
    },
    [totalPages],
  );

  // 7. Effects
  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void source
      .getAnimeHistory()
      .then((nextEntries) => {
        if (!active) {
          return;
        }

        setEntries(nextEntries);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setEntries([]);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, estadoFilter]);

  return {
    rows,
    isLoading,
    isEmpty,
    searchQuery,
    estadoFilter,
    estadoOptions: HISTORY_TABLE_ESTADO_OPTIONS,
    page: currentPage,
    totalPages,
    pageItems,
    onSearchQueryChange,
    onEstadoFilterChange,
    onPageChange,
  };
}
