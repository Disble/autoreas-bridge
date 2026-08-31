import { useMemo } from 'react';
import { useElapsedClock } from '../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock';
import { isStalePendingCapture } from '../../../../shared/store/transaction-store/transaction-store.helpers';
import { toTransactionRowLive } from '../TransactionPanel/transaction-panel.helpers';
import type { TransactionRowLiveViewModel } from '../TransactionPanel/transaction-panel.types';

/**
 * Owns the elapsed clock of ONE transport-only arrival row, and returns `null`
 * once that row is no longer genuinely in flight.
 *
 * The clock used to live in `useTransactionPanel`, one tick away from every
 * visible row: each 500ms tick re-rendered the panel, re-mapped every loaded row
 * into a fresh view-model, and rebuilt React Aria's whole table collection —
 * work that grew with the rows the user had paged in while the thing actually
 * changing was a single label. Typically 0-2 rows of N are outstanding, so the
 * clock belongs to those rows: per-tick cost is now proportional to the pending
 * rows, not the loaded ones.
 *
 * The predicate is scoped to this row's own timestamp, so there is no list-wide
 * scan of the accumulated buffer either. When the row ages past the staleness
 * window the predicate flips, `useElapsedClock` clears its interval, and a row
 * whose terminal write is never coming stops being presented as live.
 * @param capturedAtMs When the arrival row was captured (epoch ms).
 * @returns The in-flight outcome/duration presentation, or `null` once settled.
 */
export function useTransactionRowLive(capturedAtMs: number): TransactionRowLiveViewModel | null {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const now = useElapsedClock((at: number) => !isStalePendingCapture(capturedAtMs, at));
  const live = useMemo(() => toTransactionRowLive(capturedAtMs, now), [capturedAtMs, now]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return live;
}
