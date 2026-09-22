import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CaptureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import {
  getTransactionStoreState,
  matchesTransactionFilters,
  toBackendCaptureFilters,
} from '../../../../shared/store/transaction-store/transaction-store.helpers';
import { TRANSACTION_FILTER_DEBOUNCE_MS } from './transaction-panel.constants';
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
 * The push path subscribes once for the panel's lifetime: its listener reads
 * the store snapshot rather than closing over React state, so a filter or
 * selection change never tears down and re-attaches the Wails runtime
 * listener. It admits a pushed row only when it satisfies the currently
 * active filters (`matchesTransactionFilters`, the same rule the backend
 * applies over the whole table), so a filter no longer lets non-matching rows
 * keep arriving at the head of the rail. The selected row's detail refresh is
 * exempt from that gate: it refreshes a row that is already on screen
 * regardless of filters.
 *
 * The filter query waits for the SETTLED filters object: one app-wide
 * `useDebounce` holds the whole object through the debounce window, so one
 * typing burst produces exactly one query (and therefore no skeleton flicker)
 * after the user pauses. The input text itself stays immediate — the store's
 * filters update per keystroke, and the push admission below judges rows
 * against that live snapshot — only the query is delayed.
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

  // One debounce over the WHOLE filters object, never one per typed field.
  // `useDebounce` compares by identity, and the store rebuilds `filters` only
  // when a filter actually changes (`setFilters` spreads the previous object
  // into a new one; unrelated renders reuse the same identity), so the settled
  // value is stable across those renders instead of restarting the timer
  // forever. Debouncing the object — rather than the typed fields with the
  // rest merged in from a ref — is what makes one typing burst cost exactly
  // one query while a change to any other field (`animeId`, `deviceId`,
  // `changelogId`, `errorCode`, the epoch bounds) still triggers exactly one
  // settled query of its own, as every filter change did before the debounce.
  const settledFilters = useDebounce(filters, TRANSACTION_FILTER_DEBOUNCE_MS);

  const loadMore = useCallback(() => {
    if (nextCursor === null || isFetchingMoreRef.current) {
      return;
    }

    isFetchingMoreRef.current = true;

    void source.listTransactions(toBackendCaptureFilters(settledFilters, nextCursor, limit)).then((page) => {
      setPage(page.items, page.nextCursor ?? null, 'append');
      setDegraded(page.degraded);
      isFetchingMoreRef.current = false;
    });
  }, [limit, nextCursor, setDegraded, setPage, settledFilters, source]);

  useEffect(() => {
    let active = true;
    // A filter change is a new query, so any page still in flight for the old
    // one must not hold the guard closed against the new first page.
    isFetchingMoreRef.current = false;
    setLoading(true);

    // `cursor: null` here is the FIRST page of this query, not a permanent
    // "never paginate" -- `loadMore` above carries the cursor the backend
    // returned. Changing a filter therefore restarts pagination from page one
    // and `'replace'` drops every row of the previous query. The query waits
    // for the SETTLED filters object: one query per typing burst, so the rail
    // never flickers a skeleton per keystroke.
    void source.listTransactions(toBackendCaptureFilters(settledFilters, null, limit)).then((page) => {
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
  }, [limit, setDegraded, setLoading, setPage, settledFilters, source]);

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

  // The live listener reads the store snapshot rather than closing over React
  // state: the admission boundary, the head rows and the active filters all
  // change while one subscription is open, and re-subscribing on each of them
  // would drop pushes in the gap between teardown and re-attach.
  useEffect(() => {
    return runtimeSource.subscribeCaptureTransactions((row) => {
      const state = getTransactionStoreState();

      // The selected row's detail refresh is exempt from the filter gate: it
      // refreshes a row that is already on screen regardless of filters, so a
      // selected row's own terminal update must land even if the user has
      // since filtered it out of view.
      if (state.selectedId === row.requestId && row.outcome !== 'pending') {
        void source.getTransaction(row.requestId).then((result) => {
          state.setSelectedDetail(result.found ? result.item : null);
        });
      }

      // Same rule as the backend query: a pushed row that would not match the
      // active filters never enters the buffer. It is not lost -- it appears
      // when the rail next queries -- and a filter the row cannot vouch for
      // (device, changelog) rejects it the same way.
      if (!matchesTransactionFilters(row, state.filters)) {
        return;
      }

      state.upsertRows([row]);
    });
  }, [runtimeSource, source]);

  return { loadMore };
}
