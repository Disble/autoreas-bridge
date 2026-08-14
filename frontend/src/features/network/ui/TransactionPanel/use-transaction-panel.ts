import { useCallback, useMemo, useState } from 'react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import { captureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { useElapsedClock } from '../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock';
import {
  selectHasPendingTransactions,
  selectVisibleTransactionRows,
} from '../../../../shared/store/transaction-store/transaction-store.helpers';
import { DEFAULT_TRANSACTION_PAGE_LIMIT } from './transaction-panel.constants';
import { toTransactionDetail, toTransactionRow } from './transaction-panel.helpers';
import type { TransactionDetailTab } from './transaction-panel.types';
import { useTransactionFilterCallbacks } from './use-transaction-filter-callbacks';
import { useTransactionPanelSync } from './use-transaction-panel-sync';
import { useTransactionStoreBindings } from './use-transaction-store-bindings';

/**
 * useTransactionPanel wires the shared transaction store into the
 * TransactionPanel feature: it loads the first page on mount, reloads
 * (replace) whenever a server-relevant filter (route/outcome/kind) changes,
 * loads the selected row's detail, resets the detail tab on every new
 * selection, and subscribes to the `capture.transaction` runtime push so
 * arrival/terminal rows merge into the buffer live without losing the
 * current selection. All async I/O happens here; the dumb table/filter/
 * detail components only render the derived rows/state this hook returns.
 *
 * The store bindings, the filter callbacks and the asynchronous edges live in
 * their own hooks. They were split out on 2026-08-14: this function held thirty
 * hook calls, of which thirteen were store subscriptions and five were
 * one-field filter setters, and the complexity gate was right that no reader
 * can hold that at once.
 */
export function useTransactionPanel(
  source: CaptureTransactionSource = captureTransactionSource,
  limit: number = DEFAULT_TRANSACTION_PAGE_LIMIT,
  runtimeSource: CaptureRuntimeSource = captureRuntimeSource,
) {
  // 1. Refs

  // 2. State
  const [detailTab, setDetailTab] = useState<TransactionDetailTab>('general');

  // 3. Context/3rd Party Hooks
  const store = useTransactionStoreBindings();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  // The clock takes a predicate rather than a boolean so it can observe a
  // pending row aging out of the staleness window and stop itself; a plain
  // inline closure is fine because the interval keys off the resulting boolean,
  // not this function's identity.
  const now = useElapsedClock((at: number) => selectHasPendingTransactions(store.items, at));
  const rows = useMemo(
    () => selectVisibleTransactionRows(store.items, store.filters).map((row) => toTransactionRow(row, now)),
    [store.items, store.filters, now],
  );
  const detailViewModel = useMemo(
    () => (store.selectedDetail === null ? null : toTransactionDetail(store.selectedDetail)),
    [store.selectedDetail],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const { select } = store;
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onClose = useCallback(() => select(null), [select]);
  const onDetailTabChange = useCallback((tab: TransactionDetailTab) => setDetailTab(tab), []);
  const filterCallbacks = useTransactionFilterCallbacks(store.setFilters);

  // 7. Effects
  useTransactionPanelSync({ source, limit, runtimeSource, store, setDetailTab });

  return {
    rows,
    selectedId: store.selectedId,
    selectedDetail: detailViewModel,
    route: store.filters.route,
    outcome: store.filters.outcome,
    kind: store.filters.kind,
    statusClass: store.filters.statusClass,
    query: store.filters.query,
    detailTab,
    isLoading: store.isLoading,
    degraded: store.degraded,
    onSelect,
    onClose,
    ...filterCallbacks,
    onDetailTabChange,
  };
}
