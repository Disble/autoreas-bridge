import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { DEFAULT_TRANSACTION_PAGE_LIMIT } from './transaction-panel.constants';
import { toStatusFilterInput, toTransactionDetail } from './transaction-panel.helpers';
import type { TransactionDetailTab } from './transaction-panel.types';
import { useTransactionFilterCallbacks } from './use-transaction-filter-callbacks';
import { useTransactionPanelSync } from './use-transaction-panel-sync';
import { useTransactionPanelWindow } from './use-transaction-panel-window';
import { useTransactionRowViewModels } from './use-transaction-row-view-models';
import { useTransactionStoreBindings } from './use-transaction-store-bindings';

/**
 * useTransactionPanel composes the Transactions rail: the cursor-paged store,
 * the virtual visible window, and the asynchronous edges. It owns no async
 * I/O and no window arithmetic of its own — those live in
 * `use-transaction-panel-sync` and `use-transaction-panel-window`, and the
 * store subscriptions live in `use-transaction-store-bindings`.
 *
 * Every filter is evaluated by the backend over the whole capture table. The
 * rail used to narrow the status class and a free-text query over the rows it
 * had already loaded, which made a match one page further down unreachable
 * however far the user paged; nothing filters the loaded rows any more.
 *
 * The store bindings, the filter callbacks and the asynchronous edges live in
 * their own hooks. They were split out on 2026-08-14: this function held thirty
 * hook calls, of which thirteen were store subscriptions and five were
 * one-field filter setters, and the complexity gate was right that no reader
 * can hold that at once.
 */
export function useTransactionPanel(
  source: CaptureTransactionSource = createCaptureTransactionSource(),
  limit: number = DEFAULT_TRANSACTION_PAGE_LIMIT,
  runtimeSource: CaptureRuntimeSource = captureRuntimeSource,
) {
  // 1. Refs
  // The window triggers load-more, but the sync hook that owns it is declared
  // below with the other effects. A ref bridges the two without reordering the
  // hook anatomy and keeps `onReachEnd` stable across renders.
  const loadMoreRef = useRef<() => void>(() => undefined);

  // 2. State
  const [detailTab, setDetailTab] = useState<TransactionDetailTab>('general');

  // 3. Context/3rd Party Hooks
  const store = useTransactionStoreBindings();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const onReachEnd = useCallback(() => loadMoreRef.current(), []);
  const { windowedRows, topSpacerHeightPx, bottomSpacerHeightPx, scrollRef } = useTransactionPanelWindow({
    items: store.items,
    onReachEnd,
  });
  // Clock-free and identity-stable per store row, so a scroll or a push renders
  // only the rows that entered the window (`use-transaction-row-view-models`).
  const rows = useTransactionRowViewModels(windowedRows);
  const detailViewModel = useMemo(
    () => (store.selectedDetail === null ? null : toTransactionDetail(store.selectedDetail)),
    [store.selectedDetail],
  );
  const status = toStatusFilterInput(store.filters.httpStatus);
  // Two flags, two meanings. `isLoading` is "nothing to show yet": the store
  // is fetching and there are no rows on screen, so the skeleton placeholder
  // is the honest state. `isUpdating` is "a settled filter query is in flight
  // while rows are on screen": the rail keeps its rows and shows the updating
  // hint instead, so a keystroke burst never swaps the rows for skeletons.
  const hasRows = store.items.length > 0;
  const isLoading = store.isLoading && !hasRows;
  const isUpdating = store.isLoading && hasRows;

  // 6. Callbacks (useCallback calling pure helpers)
  const { select } = store;
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onClose = useCallback(() => select(null), [select]);
  const onDetailTabChange = useCallback((tab: TransactionDetailTab) => setDetailTab(tab), []);
  const filterCallbacks = useTransactionFilterCallbacks(store.setFilters);

  // 7. Effects
  const { loadMore } = useTransactionPanelSync({ source, limit, runtimeSource, store, setDetailTab });

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  return {
    rows,
    selectedId: store.selectedId,
    selectedDetail: detailViewModel,
    route: store.filters.route,
    outcome: store.filters.outcome,
    kind: store.filters.kind,
    status,
    detailTab,
    isLoading,
    isUpdating,
    degraded: store.degraded,
    onSelect,
    onClose,
    scrollRef,
    topSpacerHeightPx,
    bottomSpacerHeightPx,
    ...filterCallbacks,
    onDetailTabChange,
  };
}
