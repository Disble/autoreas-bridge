import { useCallback, useEffect, useMemo, useState } from 'react';
import { isWailsRuntimeAvailable, observabilityLogSource } from '../../../../infrastructure/observability-log-source';
import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source';
import { connectNetworkStore, useNetworkStore } from '../../../../shared/store/network-store';
import { selectFilteredRows, selectRowById } from '../../../../shared/store/network-store.helpers';
import { toNetworkRowViewModel } from './network-panel.helpers';
import type { NetworkStatusFilter } from './network-panel.types';

/**
 * useNetworkPanel wires the Zustand Network store into the Network feature.
 * It establishes the single source->store bridge, then exposes filtered,
 * presentation-ready rows, the selected row, filter state, and the mutating
 * handlers the dumb table/filter/detail components render.
 */
export function useNetworkPanel(source: ObservabilityLogSource = observabilityLogSource) {
  // 1. Refs

  // 2. State
  const [isLoading, setIsLoading] = useState(true);

  // 3. Context/3rd Party Hooks
  const buffer = useNetworkStore((state) => state.buffer);
  const selectedId = useNetworkStore((state) => state.selectedId);
  const query = useNetworkStore((state) => state.query);
  const statusFilter = useNetworkStore((state) => state.statusFilter);
  const select = useNetworkStore((state) => state.select);
  const setQuery = useNetworkStore((state) => state.setQuery);
  const setStatusFilter = useNetworkStore((state) => state.setStatusFilter);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const filteredRows = useMemo(() => selectFilteredRows(buffer, query, statusFilter), [buffer, query, statusFilter]);
  const rows = useMemo(() => filteredRows.map(toNetworkRowViewModel), [filteredRows]);
  const selectedRow = useMemo(() => selectRowById(buffer, selectedId), [buffer, selectedId]);
  const captureUnavailable = !isLoading && !isWailsRuntimeAvailable();

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onQueryChange = useCallback((nextQuery: string) => setQuery(nextQuery), [setQuery]);
  const onStatusFilterChange = useCallback(
    (nextStatusFilter: NetworkStatusFilter) => setStatusFilter(nextStatusFilter),
    [setStatusFilter],
  );

  // 7. Effects
  useEffect(() => {
    connectNetworkStore(source);
  }, [source]);

  useEffect(() => {
    let active = true;

    void source.getRecentLogs().then(() => {
      if (active) {
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [source]);

  return {
    rows,
    selectedRow,
    query,
    statusFilter,
    isLoading,
    captureUnavailable,
    onSelect,
    onQueryChange,
    onStatusFilterChange,
  };
}
