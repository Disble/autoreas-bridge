import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isWailsRuntimeAvailable, observabilityLogSource } from '../../../../infrastructure/observability-log-source';
import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source';
import { connectNetworkStore, useNetworkStore } from '../../../../shared/store/network-store';
import { selectEntryById, selectEntryViewRows } from '../../../../shared/store/network-store.helpers';
import { countEntries, countErrorEntries, toNetworkDetailViewModel, toNetworkEntryViewModel } from './network-panel.helpers';
import { NETWORK_STICK_TO_BOTTOM_THRESHOLD_PX } from './network-panel.constants';
import type { NetworkDetailTab, NetworkDomainFilter, NetworkLevelFilter } from './network-panel.types';

/**
 * useNetworkPanel wires the Zustand Network store into the Network feature.
 * It establishes the single source->store bridge, then exposes per-entry
 * rows, the selected entry's detail, filter state, and the mutating handlers
 * the dumb table/filter/detail components render. Rows are per-entry (NOT
 * folded by correlationId) — every bridge log entry renders its own row,
 * matching the Observability feed.
 */
export function useNetworkPanel(source: ObservabilityLogSource = observabilityLogSource) {
  // 1. Refs
  const previousSelectedIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  // 2. State
  const [isLoading, setIsLoading] = useState(true);
  const [detailTab, setDetailTab] = useState<NetworkDetailTab>('general');

  // 3. Context/3rd Party Hooks
  const buffer = useNetworkStore((state) => state.buffer);
  const selectedId = useNetworkStore((state) => state.selectedId);
  const query = useNetworkStore((state) => state.query);
  const levelFilter = useNetworkStore((state) => state.levelFilter);
  const domainFilter = useNetworkStore((state) => state.domainFilter);
  const select = useNetworkStore((state) => state.select);
  const setQuery = useNetworkStore((state) => state.setQuery);
  const setLevelFilter = useNetworkStore((state) => state.setLevelFilter);
  const setDomainFilter = useNetworkStore((state) => state.setDomainFilter);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const entryRows = useMemo(
    () => selectEntryViewRows(buffer, query, levelFilter, domainFilter),
    [buffer, query, levelFilter, domainFilter],
  );
  const rows = useMemo(() => entryRows.map(toNetworkEntryViewModel), [entryRows]);
  const allEntryRows = useMemo(() => selectEntryViewRows(buffer, '', 'all'), [buffer]);
  const selectedEntry = useMemo(() => selectEntryById(buffer, selectedId), [buffer, selectedId]);
  const selectedDetail = useMemo(() => {
    if (selectedId === null || selectedEntry === null) {
      return null;
    }

    return toNetworkDetailViewModel({ id: selectedId, entry: selectedEntry }, allEntryRows);
  }, [selectedId, selectedEntry, allEntryRows]);
  const captureUnavailable = !isLoading && !isWailsRuntimeAvailable();
  const entryCount = useMemo(() => countEntries(buffer), [buffer]);
  const errorCount = useMemo(() => countErrorEntries(buffer), [buffer]);
  const shownCount = rows.length;

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onQueryChange = useCallback((nextQuery: string) => setQuery(nextQuery), [setQuery]);
  const onLevelFilterChange = useCallback(
    (nextLevelFilter: NetworkLevelFilter) => setLevelFilter(nextLevelFilter),
    [setLevelFilter],
  );
  const onDomainFilterChange = useCallback(
    (nextDomainFilter: NetworkDomainFilter) => setDomainFilter(nextDomainFilter),
    [setDomainFilter],
  );
  const onDetailTabChange = useCallback((nextTab: NetworkDetailTab) => setDetailTab(nextTab), []);
  const onClose = useCallback(() => select(null), [select]);
  const onTableScroll = useCallback(() => {
    const node = scrollRef.current;

    if (node === null) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom <= NETWORK_STICK_TO_BOTTOM_THRESHOLD_PX;
  }, []);

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

  useEffect(() => {
    if (previousSelectedIdRef.current !== selectedId) {
      previousSelectedIdRef.current = selectedId;
      setDetailTab('general');
    }
  }, [selectedId]);

  useLayoutEffect(() => {
    const node = scrollRef.current;

    if (node === null || !pinnedToBottomRef.current) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [rows, isLoading]);

  return {
    rows,
    selectedId,
    selectedEntry,
    selectedDetail,
    query,
    levelFilter,
    domainFilter,
    detailTab,
    isLoading,
    captureUnavailable,
    entryCount,
    errorCount,
    shownCount,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
    scrollRef,
    onTableScroll,
  };
}
