import { useCallback, useEffect, useRef, useState } from 'react';
import { createRuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.helpers';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import { EVENT_PAGE_SIZE } from './network-panel.constants';
import { readCorrelationId } from './network-panel.helpers';
import type { RuntimeEventRow } from './network-panel.types';
import { useNetworkPanelActions } from './use-network-panel-actions';
import { useNetworkPanelDetailTab } from './use-network-panel-detail-tab';
import { useNetworkPanelFilters } from './use-network-panel-filters';
import { useNetworkPanelLoading } from './use-network-panel-loading';
import { useNetworkPanelSync } from './use-network-panel-sync';
import { useNetworkPanelViewModel } from './use-network-panel-view-model';
import { useNetworkPanelWindow } from './use-network-panel-window';
import { useNetworkStoreBindings } from './use-network-store-bindings';

/**
 * useNetworkPanel composes the Runtime Events rail: the persisted-page +
 * live-overlay store, the virtual window over the merged feed, and the
 * asynchronous edges. It owns no async I/O and no window arithmetic of its
 * own — those live in `use-network-panel-sync` and the shared virtual rail
 * window, and the store subscriptions live in `use-network-store-bindings`.
 * The settled-filter contract lives in `use-network-panel-filters`, and the
 * asynchronous query status (the in-flight and degraded flags plus the two
 * loading meanings) in `use-network-panel-loading`, so this hook composes the
 * rail's concerns instead of carrying their subtleties inline.
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
  // The window triggers load-more, but the sync hook that owns it is declared
  // below with the other effects. A ref bridges the two without reordering the
  // hook anatomy and keeps `onReachEnd` stable across renders.
  const loadMoreRef = useRef<() => void>(() => undefined);

  // 2. State
  const [traceSiblings, setTraceSiblings] = useState<readonly RuntimeEventRow[]>([]);

  // 3. Context/3rd Party Hooks
  const store = useNetworkStoreBindings();

  // 4. Queries/Mutations
  // The settled filter contract (one debounce over the whole memoized object)
  // and its rationale live in `use-network-panel-filters`.
  const settledFilters = useNetworkPanelFilters(store);

  // 5. Derived State (useMemo)
  const onReachEnd = useCallback(() => loadMoreRef.current(), []);
  // The `feed` projection is passed inline on purpose: every consumer (the
  // window's merge memo and its overlay bookkeeping) keys on the `page` and
  // `overlay` fields themselves, so the object identity never needs to be
  // stable.
  const { rows: feedRows, windowedRows, topSpacerHeightPx, bottomSpacerHeightPx, scrollRef } = useNetworkPanelWindow({
    feed: { page: store.page, overlay: store.overlay },
    onReachEnd,
  });
  const { detailTab, onDetailTabChange } = useNetworkPanelDetailTab(store.selectedId);
  // The rail's asynchronous status (the in-flight and degraded flags, and the
  // two loading meanings) and its contract live in `use-network-panel-loading`.
  const { degraded, hasNothingToShow, isUpdating, setDegraded, setLoading } = useNetworkPanelLoading({ feedRows });
  const { rows, selectedEntry, selectedDetail, statusMessage, emptyMessage, entryCount, errorCount } =
    useNetworkPanelViewModel({
      // The TABLE renders the virtual window's slice; the full merged feed
      // still drives the selection and the summary counters.
      visibleRows: windowedRows,
      feedRows,
      selectedId: store.selectedId,
      traceSiblings,
      available: store.available,
      degraded,
    });

  // 6. Callbacks (useCallback calling pure helpers)
  const { onSelect, onQueryChange, onLevelFilterChange, onDomainFilterChange, onClose } = useNetworkPanelActions({
    select: store.select,
    setQuery: store.setQuery,
    setLevelFilter: store.setLevelFilter,
    setDomainFilter: store.setDomainFilter,
  });

  // 7. Effects
  const { loadMore } = useNetworkPanelSync({
    source,
    limit,
    // The sync hook names its input `filters`; it receives the SETTLED object
    // so its query effect and `loadMore` never read mid-burst values.
    filters: settledFilters,
    selectedCorrelationId: readCorrelationId(selectedEntry),
    store,
    setLoading,
    setDegraded,
    setTraceSiblings,
  });

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

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
    isLoading: hasNothingToShow,
    isUpdating,
    statusMessage,
    emptyMessage,
    entryCount,
    errorCount,
    // Under virtualization every loaded row is rendered into the table — the
    // mounted window is a rendering detail, not a shown count — so "shown"
    // stays the loaded feed's size instead of the view model's mounted-row
    // count, which would fluctuate with every scroll.
    shownCount: feedRows.length,
    topSpacerHeightPx,
    bottomSpacerHeightPx,
    scrollRef,
    onSelect,
    onQueryChange,
    onLevelFilterChange,
    onDomainFilterChange,
    onDetailTabChange,
    onClose,
  };
}
