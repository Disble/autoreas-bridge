import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import { captureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { useElapsedClock } from '../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock';
import {
  selectHasPendingTransactions,
  selectVisibleTransactionRows,
  toBackendCaptureFilters,
} from '../../../../shared/store/transaction-store/transaction-store.helpers';
import { useTransactionStore } from '../../../../shared/store/transaction-store/use-transaction-store';
import type { TransactionStatusClassFilter } from '../../../../shared/store/transaction-store/transaction-store.types';
import { DEFAULT_TRANSACTION_PAGE_LIMIT } from './transaction-panel.constants';
import { toTransactionDetail, toTransactionRow } from './transaction-panel.helpers';
import type { TransactionDetailTab } from './transaction-panel.types';

/**
 * useTransactionPanel wires the shared transaction store into the
 * TransactionPanel feature: it loads the first page on mount, reloads
 * (replace) whenever a server-relevant filter (route/outcome/kind) changes,
 * loads the selected row's detail, resets the detail tab on every new
 * selection, and subscribes to the `capture.transaction` runtime push so
 * arrival/terminal rows merge into the buffer live without losing the
 * current selection. All async I/O happens here; the dumb table/filter/
 * detail components only render the derived rows/state this hook returns.
 */
export function useTransactionPanel(
  source: CaptureTransactionSource = captureTransactionSource,
  limit: number = DEFAULT_TRANSACTION_PAGE_LIMIT,
  runtimeSource: CaptureRuntimeSource = captureRuntimeSource,
) {
  // 1. Refs
  const previousSelectedIdRef = useRef<string | null>(null);

  // 2. State
  const [detailTab, setDetailTab] = useState<TransactionDetailTab>('general');

  // 3. Context/3rd Party Hooks
  const items = useTransactionStore((state) => state.items);
  const selectedId = useTransactionStore((state) => state.selectedId);
  const selectedDetail = useTransactionStore((state) => state.selectedDetail);
  const filters = useTransactionStore((state) => state.filters);
  const degraded = useTransactionStore((state) => state.degraded);
  const isLoading = useTransactionStore((state) => state.isLoading);
  const setPage = useTransactionStore((state) => state.setPage);
  const upsertRows = useTransactionStore((state) => state.upsertRows);
  const setFilters = useTransactionStore((state) => state.setFilters);
  const select = useTransactionStore((state) => state.select);
  const setSelectedDetail = useTransactionStore((state) => state.setSelectedDetail);
  const setDegraded = useTransactionStore((state) => state.setDegraded);
  const setLoading = useTransactionStore((state) => state.setLoading);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  // The clock takes a predicate rather than a boolean so it can observe a
  // pending row aging out of the staleness window and stop itself; a plain
  // inline closure is fine because the interval keys off the resulting boolean,
  // not this function's identity.
  const now = useElapsedClock((at: number) => selectHasPendingTransactions(items, at));
  const rows = useMemo(
    () => selectVisibleTransactionRows(items, filters).map((row) => toTransactionRow(row, now)),
    [items, filters, now],
  );
  const detailViewModel = useMemo(
    () => (selectedDetail === null ? null : toTransactionDetail(selectedDetail)),
    [selectedDetail],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelect = useCallback((id: string) => select(id), [select]);
  const onClose = useCallback(() => select(null), [select]);
  const onRouteChange = useCallback((route: string) => setFilters({ route }), [setFilters]);
  const onOutcomeChange = useCallback((outcome: string) => setFilters({ outcome }), [setFilters]);
  const onKindChange = useCallback((kind: string) => setFilters({ kind }), [setFilters]);
  const onStatusClassChange = useCallback(
    (statusClass: TransactionStatusClassFilter) => setFilters({ statusClass }),
    [setFilters],
  );
  const onQueryChange = useCallback((query: string) => setFilters({ query }), [setFilters]);
  const onDetailTabChange = useCallback((tab: TransactionDetailTab) => setDetailTab(tab), []);

  // 7. Effects
  useEffect(() => {
    let active = true;
    setLoading(true);

    void source
      .listTransactions(toBackendCaptureFilters(filters, null, limit))
      .then((page) => {
        if (!active) {
          return;
        }

        setPage(page.items, page.nextCursor ?? null, 'replace');
        setDegraded(page.degraded);
        setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [source, limit, filters.route, filters.outcome, filters.kind]);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }

    let active = true;

    void source.getTransaction(selectedId).then((result) => {
      if (!active) {
        return;
      }

      setSelectedDetail(result.found ? result.item : null);
    });

    return () => {
      active = false;
    };
  }, [source, selectedId, setSelectedDetail]);

  useEffect(() => {
    if (previousSelectedIdRef.current !== selectedId) {
      previousSelectedIdRef.current = selectedId;
      setDetailTab('general');
    }
  }, [selectedId]);

  useEffect(() => {
    return runtimeSource.subscribeCaptureTransactions((row) => {
      upsertRows([row]);
      if (selectedId === row.requestId && row.outcome !== 'pending') {
        void source.getTransaction(row.requestId).then((result) => {
          setSelectedDetail(result.found ? result.item : null);
        });
      }
    });
  }, [runtimeSource, selectedId, setSelectedDetail, source, upsertRows]);

  return {
    rows,
    selectedId,
    selectedDetail: detailViewModel,
    route: filters.route,
    outcome: filters.outcome,
    kind: filters.kind,
    statusClass: filters.statusClass,
    query: filters.query,
    detailTab,
    isLoading,
    degraded,
    onSelect,
    onClose,
    onRouteChange,
    onOutcomeChange,
    onKindChange,
    onStatusClassChange,
    onQueryChange,
    onDetailTabChange,
  };
}
