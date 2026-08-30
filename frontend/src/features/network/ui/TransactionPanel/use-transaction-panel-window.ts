import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureRow } from '../../../../shared/contracts/capture.types';
import { reconcileVisibleEventCount } from '../NetworkPanel/network-feed.helpers';
import { DEFAULT_TRANSACTION_PAGE_LIMIT, TRANSACTION_PAGE_INITIAL_COUNT } from './transaction-panel.constants';

/** Everything the live window needs from the loaded rows and the current selection. */
interface TransactionPanelWindowInput {
  /** Every capture row loaded so far, newest-first: cursor pages at the tail, live pushes at the head. */
  readonly items: readonly CaptureRow[];
  readonly selectedId: string | null;
  /** Called when the growth would run past the loaded rows, so the next cursor page can be fetched. */
  readonly onReachEnd: () => void;
}

/**
 * Owns the Transactions rail's visible window.
 *
 * **This rail is LIVE** (ADR-012, live branch): the `capture.transaction` push
 * inserts arrival and terminal rows at the head while the user reads. It
 * therefore does NOT use `useProgressiveListWindow` — that hook's render-phase
 * reset would snap the user back to the first batch on every pushed capture.
 * Rows are appended and never unmounted, so the scrollbar starts short and
 * grows honestly; there is no windowing, no virtualization and no
 * `Virtualizer`/`ListLayout`.
 *
 * The reconciliation itself is `reconcileVisibleEventCount`, shared with the
 * Runtime Events rail rather than reimplemented. A capture push is a head
 * insertion exactly like a runtime-event push, so it needs the same
 * `prependedCount` term: without it every push silently drops the bottom
 * visible row, and a second copy of these rules is a second place for that term
 * to go missing (design §4.1).
 *
 * The batch's ORIGIN is the only thing that differs from the in-memory rails:
 * once the window has consumed every loaded row, the next batch is the next
 * backend cursor page rather than a slice of a local buffer.
 * @param input The loaded rows, the current selection, and the load-more trigger.
 * @returns The windowed slice, its size, and the sentinel's load-more handler.
 */
export function useTransactionPanelWindow(input: Readonly<TransactionPanelWindowInput>) {
  const { items, selectedId, onReachEnd } = input;

  // 1. Refs
  const previousTotalRef = useRef(0);
  const previousHeadIdRef = useRef<string | null>(null);

  // 2. State
  const [visibleCount, setVisibleCount] = useState(TRANSACTION_PAGE_INITIAL_COUNT);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const identities = useMemo(() => items.map((item) => ({ id: item.requestId })), [items]);
  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onLoadMore = useCallback(() => {
    setVisibleCount(Math.min(items.length, visibleCount + DEFAULT_TRANSACTION_PAGE_LIMIT));

    if (visibleCount + DEFAULT_TRANSACTION_PAGE_LIMIT >= items.length) {
      onReachEnd();
    }
  }, [items.length, onReachEnd, visibleCount]);

  // 7. Effects
  useEffect(() => {
    // Both bookkeeping values are read into locals BEFORE the updater is
    // queued: React may run a state updater eagerly or defer it, so reading the
    // refs from inside the closure would sometimes see the values the two lines
    // below have already overwritten.
    const previousTotal = previousTotalRef.current;
    const prependedCount = countPrependedRows(identities, previousHeadIdRef.current, previousTotal);

    previousTotalRef.current = identities.length;
    previousHeadIdRef.current = identities[0]?.id ?? null;

    setVisibleCount((currentVisibleCount) =>
      reconcileVisibleEventCount({
        currentVisibleCount,
        previousTotal,
        nextRows: identities,
        selectedId,
        prependedCount,
        initialCount: TRANSACTION_PAGE_INITIAL_COUNT,
      }),
    );
  }, [identities, selectedId]);

  return { visibleItems, visibleCount, onLoadMore };
}

/**
 * Counts how many rows entered at the head since the previous pass.
 *
 * The Runtime Events rail can subtract two overlay lengths because its store
 * keeps the live half separate. Transactions merge pushes straight into one
 * buffer, so the head insertions are recovered by locating the previously
 * newest row: everything above it is new. A row that is no longer present (a
 * filter reload replaced the whole buffer) prepends nothing — that is a fresh
 * query, not an insertion — and neither does an in-place terminal update, which
 * leaves the head where it was.
 */
function countPrependedRows(
  rows: readonly { readonly id: string }[],
  previousHeadId: string | null,
  previousTotal: number,
): number {
  if (previousHeadId === null || previousTotal === 0 || rows.length <= previousTotal) {
    return 0;
  }

  const previousHeadIndex = rows.findIndex((entry) => entry.id === previousHeadId);

  return previousHeadIndex <= 0 ? 0 : previousHeadIndex;
}
