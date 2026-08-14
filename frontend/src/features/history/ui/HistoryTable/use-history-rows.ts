import { useMemo } from 'react';
import type { AnimeHistoryEntry } from '../../../../shared/contracts/anime.types';
import { HISTORY_TABLE_PAGE_SIZE } from './history-table.constants';
import {
  filterHistoryEntries,
  getHistoryPageItems,
  getHistoryTotalPages,
  paginateHistoryEntries,
  sortHistoryEntries,
} from './history-table.helpers';

/** The filter, sort and page inputs the row projection reads. */
interface HistoryRowsInput {
  readonly entries: readonly AnimeHistoryEntry[];
  readonly debouncedQuery: string;
  readonly estadoFilter: string;
  readonly tipoFilter: string;
  readonly sortOrder: string;
  readonly page: number;
  readonly isLoading: boolean;
}

/**
 * Runs the client-side filter, sort and pagination pipeline over the full
 * History list. Split out of `useHistoryTable` on 2026-08-14: six of its
 * eighteen hook calls were this one chain, and none of them touches the URL or
 * the fetch that the rest of the hook is about.
 * @param input The list plus the current filter, sort and page state.
 * @returns The visible page and the paging summary the table renders.
 */
export function useHistoryRows(input: Readonly<HistoryRowsInput>) {
  const { entries, debouncedQuery, estadoFilter, tipoFilter, sortOrder, page, isLoading } = input;

  const filteredEntries = useMemo(
    () => filterHistoryEntries(entries, debouncedQuery, estadoFilter, tipoFilter),
    [entries, debouncedQuery, estadoFilter, tipoFilter],
  );
  const sortedEntries = useMemo(
    () => sortHistoryEntries(filteredEntries, sortOrder),
    [filteredEntries, sortOrder],
  );
  const totalPages = useMemo(
    () => getHistoryTotalPages(sortedEntries.length, HISTORY_TABLE_PAGE_SIZE),
    [sortedEntries.length],
  );
  const currentPage = Math.min(page, totalPages);
  const rows = useMemo(
    () => paginateHistoryEntries(sortedEntries, currentPage, HISTORY_TABLE_PAGE_SIZE),
    [sortedEntries, currentPage],
  );
  const isEmpty = useMemo(() => !isLoading && sortedEntries.length === 0, [isLoading, sortedEntries.length]);
  const pageItems = useMemo(() => getHistoryPageItems(currentPage, totalPages), [currentPage, totalPages]);

  return { rows, totalPages, currentPage, isEmpty, pageItems };
}
