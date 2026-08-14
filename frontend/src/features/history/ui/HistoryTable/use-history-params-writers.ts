import { useCallback } from 'react';
import type { SetURLSearchParams } from 'react-router';
import { serializeHistoryParams } from './history-table.helpers';
import type { HistoryParamsState } from './history-table.types';

/** The current URL-backed state a partial write is merged onto. */
interface HistoryParamsWritersInput {
  readonly current: HistoryParamsState;
  readonly totalPages: number;
  readonly setSearchParams: SetURLSearchParams;
}

/**
 * Builds the callbacks that push filter, sort and page changes into the
 * `/history` query string. Every one of them merges a partial onto the current
 * params and serializes, so they are one behavior with five entry points; split
 * out of `useHistoryTable` on 2026-08-14 to keep that hook under the complexity
 * gate. `writeParams` is returned too, because the debounced-search effect
 * writes through the same path.
 * @param input The current params, the page ceiling and the URL setter.
 * @returns `writeParams` plus one callback per control.
 */
export function useHistoryParamsWriters(input: Readonly<HistoryParamsWritersInput>) {
  const { current, totalPages, setSearchParams } = input;
  const { q, estado, tipo, sort, page } = current;

  const writeParams = useCallback(
    (next: Partial<HistoryParamsState>, options: { replace?: boolean } = {}) => {
      const merged: HistoryParamsState = { q, estado, tipo, sort, page, ...next };

      setSearchParams(serializeHistoryParams(merged), { replace: options.replace ?? false });
    },
    [q, estado, tipo, sort, page, setSearchParams],
  );
  const onEstadoFilterChange = useCallback(
    (nextEstado: string) => {
      writeParams({ estado: nextEstado, page: 1 });
    },
    [writeParams],
  );
  const onTipoFilterChange = useCallback(
    (nextTipo: string) => {
      writeParams({ tipo: nextTipo, page: 1 });
    },
    [writeParams],
  );
  const onSortOrderChange = useCallback(
    (nextSort: string) => {
      writeParams({ sort: nextSort, page: 1 });
    },
    [writeParams],
  );
  const onPageChange = useCallback(
    (nextPage: number) => {
      writeParams({ page: Math.min(Math.max(nextPage, 1), totalPages) });
    },
    [writeParams, totalPages],
  );

  return { writeParams, onEstadoFilterChange, onTipoFilterChange, onSortOrderChange, onPageChange };
}
