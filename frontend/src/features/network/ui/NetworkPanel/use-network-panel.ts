import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isWailsRuntimeAvailable, observabilityLogSource } from '../../../../infrastructure/observability-log-source/observability-log-source.helpers';
import type { ObservabilityLogSource } from '../../../../infrastructure/observability-log-source/observability-log-source.types';
import { connectNetworkStore } from '../../../../shared/store/network-store/network-store.helpers';
import { useNetworkStore } from '../../../../shared/store/network-store/network-store';
import { getNetworkPanelRows, getNetworkPanelSelection, getNetworkPanelSummary } from './network-panel.helpers';
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
  const rows = useMemo(
    () => getNetworkPanelRows(buffer, query, levelFilter, domainFilter),
    [buffer, query, levelFilter, domainFilter],
  );
  const { selectedEntry, selectedDetail } = useMemo(
    () => getNetworkPanelSelection(buffer, selectedId),
    [buffer, selectedId],
  );
  const captureUnavailable = !isLoading && !isWailsRuntimeAvailable();
  const { entryCount, errorCount, shownCount } = useMemo(
    () => getNetworkPanelSummary(buffer, rows.length),
    [buffer, rows.length],
  );

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

  // 7. Effects
  useEffect(() => {
    return connectNetworkStore(source);
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

  // Live feed sticks to the bottom on every new batch. scrollRef is the
  // vertical scroller wrapping the HeroUI Table; we set scrollTop both
  // synchronously (pre-paint) and on the next frame to survive any post-render
  // scroll reset from the underlying React Aria Table.
  useLayoutEffect(() => {
    const node = scrollRef.current;

    if (node === null) {
      return;
    }

    const stickToBottom = () => {
      node.scrollTop = node.scrollHeight;
    };

    stickToBottom();
    const frame = requestAnimationFrame(stickToBottom);

    return () => cancelAnimationFrame(frame);
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
  };
}
