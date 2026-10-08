import { useMemo, useState } from 'react';
import type { CaptureRow } from '../../../../shared/contracts/capture.types';
import { toCachedTransactionRows } from './transaction-panel.helpers';
import type { TransactionRowViewModel } from './transaction-panel.types';

/**
 * Presents the virtual window's store rows as settled row view-models that keep
 * their identity for as long as the store row does.
 *
 * The window slice is a new array on every scroll and push, but the rows inside
 * it are mostly the same store objects. Handing each one back the view-model it
 * already had is what lets `TransactionRow`'s memo skip it, so a scroll renders
 * only the rows that entered the window instead of all of them.
 *
 * No clock here, deliberately. This mapping used to take a ticking `now`, so
 * twice a second it rebuilt every visible row's view-model, handed React Aria a
 * table of fresh element identities, and rebuilt the whole collection. A row's
 * live elapsed indicator is derived where it is shown instead
 * (`use-transaction-row-live`).
 * @param windowedRows The store rows the virtual window reports in view.
 * @returns One view-model per windowed row, identity-stable per store row.
 */
export function useTransactionRowViewModels(windowedRows: readonly Readonly<CaptureRow>[]): readonly TransactionRowViewModel[] {
  // 1. Refs

  // 2. State
  // One cache for the panel's lifetime; weak, so a row the store drops frees its view-model.
  const [cache] = useState(() => new WeakMap<Readonly<CaptureRow>, TransactionRowViewModel>());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const rows = useMemo(() => toCachedTransactionRows(windowedRows, cache), [windowedRows, cache]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return rows;
}
