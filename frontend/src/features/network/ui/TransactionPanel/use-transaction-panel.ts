import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { useElapsedClock } from '../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock';
import { selectHasPendingTransactions } from '../../../../shared/store/transaction-store/transaction-store.helpers';
import { DEFAULT_TRANSACTION_PAGE_LIMIT } from './transaction-panel.constants';
import {
  hasMoreTransactions,
  toStatusFilterInput,
  toTransactionDetail,
  toTransactionRow,
} from './transaction-panel.helpers';
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
  const { visibleItems, visibleCount, onLoadMore } = useTransactionPanelWindow({
    items: store.items,
    selectedId: store.selectedId,
    onReachEnd,
  });
  // The clock takes a predicate rather than a boolean so it can observe a
  // pending row aging out of the staleness window and stop itself; a plain
  // inline closure is fine because the interval keys off the resulting boolean,
  // not this function's identity.
  const now = useElapsedClock((at: number) => selectHasPendingTransactions(store.items, at));
  const rows = useMemo(() => visibleItems.map((row) => toTransactionRow(row, now)), [visibleItems, now]);
  const detailViewModel = useMemo(
    () => (store.selectedDetail === null ? null : toTransactionDetail(store.selectedDetail)),
    [store.selectedDetail],
  );
  const hasNextPage = hasMoreTransactions(store.nextCursor, visibleCount, store.items.length);
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
    hasNextPage,
    onSelect,
    onClose,
    onLoadMore,
    ...filterCallbacks,
    onDetailTabChange,
  };
}
