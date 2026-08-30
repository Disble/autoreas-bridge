import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.helpers';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import { EVENT_PAGE_SIZE } from './network-panel.constants';
import {
  getNetworkPanelRows,
  getNetworkPanelSelection,
  getNetworkPanelSummary,
  readCorrelationId,
  resolveEventEmptyMessage,
  resolveEventStatusMessage,
} from './network-panel.helpers';
import type { NetworkDetailTab, NetworkLevelFilter, RuntimeEventRow } from './network-panel.types';
import { useNetworkPanelSync } from './use-network-panel-sync';
import { useNetworkPanelWindow } from './use-network-panel-window';
import { useNetworkStoreBindings } from './use-network-store-bindings';

/**
 * useNetworkPanel composes the Runtime Events rail: the persisted-page +
 * live-overlay store, the live visible window, and the asynchronous edges.
 * It owns no async I/O and no window arithmetic of its own — those live in
 * `use-network-panel-sync` and `use-network-panel-window`, and the store
 * subscriptions live in `use-network-store-bindings`.
 *
 * The rail reads the PERSISTED runtime-event store through
 * `SearchRuntimeEvents`, not the in-process ring buffer, so its history
 * survives a restart and spans the whole retention window. Rows are per-event
 * (never folded by `correlationId`) and arrive newest-first.
 *
 * There is deliberately no stick-to-bottom effect. The pre-repoint feed was
 * oldest-first, so forcing `scrollTop = scrollHeight` kept the newest row in
 * view; under newest-first the same effect would scroll to the OLDEST loaded
 * row on every push and fight `isNearListBottom` for the load-more trigger
 * (design D-6.1). New rows arrive at the top, where the user already is.
 */
export function useNetworkPanel(
  source: RuntimeEventSource = createRuntimeEventSource(),
  limit: number = EVENT_PAGE_SIZE,
) {
  // 1. Refs
  const previousSelectedIdRef = useRef<string | null>(null);
  // The window triggers load-more, but the sync hook that owns it is declared
  // below with the other effects. A ref bridges the two without reordering the
  // hook anatomy and keeps `onReachEnd` stable across renders.
  const loadMoreRef = useRef<() => void>(() => undefined);

  // 2. State
  const [isLoading, setIsLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [traceSiblings, setTraceSiblings] = useState<readonly RuntimeEventRow[]>([]);
  const [detailTab, setDetailTab] = useState<NetworkDetailTab>('general');

  // 3. Context/3rd Party Hooks
  const store = useNetworkStoreBindings();

  // 4. Queries/Mutations
  const filters = useMemo(
    () => ({ query: store.query, level: store.levelFilter, domain: store.domainFilter }),
    [store.domainFilter, store.levelFilter, store.query],
  );
  const feed = useMemo(() => ({ page: store.page, overlay: store.overlay }), [store.overlay, store.page]);

  // 5. Derived State (useMemo)
  const onReachEnd = useCallback(() => loadMoreRef.current(), []);
  const { visibleRows, rows: feedRows, onScroll } = useNetworkPanelWindow({
    feed,
    selectedId: store.selectedId,
    onReachEnd,
  });
  const rows = useMemo(() => getNetworkPanelRows(visibleRows), [visibleRows]);
  const { selectedEntry, selectedDetail } = useMemo(
    () => getNetworkPanelSelection(feedRows, store.selectedId, traceSiblings),
    [feedRows, store.selectedId, traceSiblings],
  );
  const statusMessage = resolveEventStatusMessage(store.available, degraded);
  const emptyMessage = resolveEventEmptyMessage(isLoading, statusMessage);
  const { entryCount, errorCount, shownCount } = useMemo(
    () => getNetworkPanelSummary(feedRows, rows.length),
    [feedRows, rows.length],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const { select, setQuery, setLevelFilter, setDomainFilter } = store;
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onQueryChange = useCallback((nextQuery: string) => setQuery(nextQuery), [setQuery]);
  const onLevelFilterChange = useCallback(
    (nextLevelFilter: NetworkLevelFilter) => setLevelFilter(nextLevelFilter),
    [setLevelFilter],
  );
  const onDomainFilterChange = useCallback(
    (nextDomainFilter: string) => setDomainFilter(nextDomainFilter),
    [setDomainFilter],
  );
  const onDetailTabChange = useCallback((nextTab: NetworkDetailTab) => setDetailTab(nextTab), []);
  const onClose = useCallback(() => select(null), [select]);

  // 7. Effects
  const { loadMore } = useNetworkPanelSync({
    source,
    limit,
    filters,
    selectedCorrelationId: readCorrelationId(selectedEntry),
    store,
    setLoading: setIsLoading,
    setDegraded,
    setTraceSiblings,
  });

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    if (previousSelectedIdRef.current !== store.selectedId) {
      previousSelectedIdRef.current = store.selectedId;
      setDetailTab('general');
    }
  }, [store.selectedId]);

  return {
    rows,
    selectedId: store.selectedId,
    selectedEntry,
    selectedDetail,
    query: store.query,
    levelFilter: store.levelFilter,
    domainFilter: store.domainFilter,
    domainOptions: store.domainOptions,
    detailTab,
    isLoading,
    statusMessage,
    emptyMessage,
    entryCount,
    errorCount,
    shownCount,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
    onScroll,
  };
}
