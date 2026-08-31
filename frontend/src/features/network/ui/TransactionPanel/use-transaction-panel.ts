import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { DEFAULT_TRANSACTION_PAGE_LIMIT } from './transaction-panel.constants';
import { toStatusFilterInput, toTransactionDetail, toTransactionRow } from './transaction-panel.helpers';
import type { TransactionDetailTab } from './transaction-panel.types';
import { useTransactionFilterCallbacks } from './use-transaction-filter-callbacks';
import { useTransactionPanelSync } from './use-transaction-panel-sync';
import { useTransactionPanelWindow } from './use-transaction-panel-window';
import { useTransactionStoreBindings } from './use-transaction-store-bindings';

/**
 * useTransactionPanel composes the Transactions rail: the cursor-paged store,
 * the live visible window, and the asynchronous edges. It owns no async I/O and
 * no window arithmetic of its own — those live in `use-transaction-panel-sync`
 * and `use-transaction-panel-window`, and the store subscriptions live in
 * `use-transaction-store-bindings`.
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
  const { visibleItems, onScroll } = useTransactionPanelWindow({
    items: store.items,
    selectedId: store.selectedId,
    onReachEnd,
  });
  // No clock here, deliberately. This mapping used to take a ticking `now`, so
  // twice a second it rebuilt every visible row's view-model, handed React Aria
  // a table of fresh element identities, and rebuilt the whole collection — cost
  // linear in the rows the user had paged in, at a fixed tick rate, for one
  // outstanding request. A row's live elapsed indicator is derived where it is
  // shown instead (`use-transaction-row-live`), so these rows keep their
  // identity for as long as the store does.
  const rows = useMemo(() => visibleItems.map((row) => toTransactionRow(row)), [visibleItems]);
  const detailViewModel = useMemo(
    () => (store.selectedDetail === null ? null : toTransactionDetail(store.selectedDetail)),
    [store.selectedDetail],
  );
  const status = toStatusFilterInput(store.filters.httpStatus);

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
    isLoading: store.isLoading,
    degraded: store.degraded,
    onSelect,
    onClose,
    onScroll,
    ...filterCallbacks,
    onDetailTabChange,
  };
}
