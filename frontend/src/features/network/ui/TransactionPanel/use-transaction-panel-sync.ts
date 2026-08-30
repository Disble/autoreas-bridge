import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { toBackendCaptureFilters } from '../../../../shared/store/transaction-store/transaction-store.helpers';
import type { TransactionDetailTab } from './transaction-panel.types';
import type { useTransactionStoreBindings } from './use-transaction-store-bindings';

/** Everything the panel's I/O needs from its caller. */
interface TransactionPanelSyncInput {
  readonly source: CaptureTransactionSource;
  readonly limit: number;
  readonly runtimeSource: CaptureRuntimeSource;
  readonly store: ReturnType<typeof useTransactionStoreBindings>;
  readonly setDetailTab: Dispatch<SetStateAction<TransactionDetailTab>>;
}

/**
 * Owns every asynchronous edge of the transaction panel: the first page and
 * filter-driven reloads, the selected row's detail, the detail-tab reset on a
 * new selection, and the live `capture.transaction` push subscription.
 *
 * Split out of `useTransactionPanel` on 2026-08-14. Four effects and their
 * cancellation bookkeeping were the densest part of a function that held thirty
 * hook calls; none of them is reachable from the rendering path, so keeping
 * them apart makes both halves readable on their own.
 * @param input The sources, store bindings and setters the effects drive.
 * @returns The load-more action the visible window triggers at the rail's end.
 */
export function useTransactionPanelSync(input: Readonly<TransactionPanelSyncInput>) {
  const { source, limit, runtimeSource, store, setDetailTab } = input;
  const { filters, nextCursor, selectedId, setPage, setDegraded, setLoading, setSelectedDetail, upsertRows } = store;
  const previousSelectedIdRef = useRef<string | null>(null);
  // An in-flight guard rather than store state: the sentinel can report a
  // second intersection while the first page request is still open, and a
  // second request would append the same cursor page twice.
  const isFetchingMoreRef = useRef(false);

  const loadMore = useCallback(() => {
    if (nextCursor === null || isFetchingMoreRef.current) {
      return;
    }

    isFetchingMoreRef.current = true;

    void source.listTransactions(toBackendCaptureFilters(filters, nextCursor, limit)).then((page) => {
      setPage(page.items, page.nextCursor ?? null, 'append');
      setDegraded(page.degraded);
      isFetchingMoreRef.current = false;
    });
  }, [filters, limit, nextCursor, setDegraded, setPage, source]);

  useEffect(() => {
    let active = true;
    // A filter change is a new query, so any page still in flight for the old
    // one must not hold the guard closed against the new first page.
    isFetchingMoreRef.current = false;
    setLoading(true);

    // `cursor: null` here is the FIRST page of this query, not a permanent
    // "never paginate" -- `loadMore` above carries the cursor the backend
    // returned. Changing a filter therefore restarts pagination from page one
    // and `'replace'` drops every row of the previous query.
    void source.listTransactions(toBackendCaptureFilters(filters, null, limit)).then((page) => {
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
  }, [filters, limit, setDegraded, setLoading, setPage, source]);

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
  }, [selectedId, setDetailTab]);

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

  return { loadMore };
}
