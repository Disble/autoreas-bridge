import { useEffect, useMemo, useRef } from 'react';
import {
  VIRTUAL_RAIL_OVERSCAN_ROWS,
  VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX,
} from '../../../../shared/hooks/use-virtual-rail-window/virtual-rail-window.constants';
import { useVirtualRailWindow } from '../../../../shared/hooks/use-virtual-rail-window/use-virtual-rail-window';
import type { TransactionPanelWindowInput, TransactionPanelWindowModel } from './transaction-panel.types';

/**
 * Owns the Transactions rail's VIRTUAL window by delegating to the shared
 * `useVirtualRailWindow` — the virtualizer, the deterministic viewport
 * fallback, the load-more trigger and the head-insertion compensation all
 * live there now. What stays rail-specific is exactly one thing: detecting
 * THIS rail's head insertions, because a capture push, a filter reload and an
 * in-place terminal delta are capture-shaped questions the shared window
 * must not know about.
 *
 * The layout constants come from the shared window's constants rather than a
 * transaction copy, so the two rails cannot drift into two different
 * windowing rules.
 * @param input The loaded rows and the load-more trigger.
 * @returns The in-view rows, the spacer heights, and the scroll ref.
 */
export function useTransactionPanelWindow(input: Readonly<TransactionPanelWindowInput>): TransactionPanelWindowModel {
  const { items, onReachEnd } = input;

  // 1. Refs
  const previousTotalRef = useRef(0);
  const previousHeadIdRef = useRef<string | null>(null);

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const identities = useMemo(() => items.map((item) => ({ id: item.requestId })), [items]);
  const prependCount = countPrependedRows(identities, previousHeadIdRef.current, previousTotalRef.current);
  const model = useVirtualRailWindow({
    estimateSizePx: VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX,
    items,
    onReachEnd,
    overscan: VIRTUAL_RAIL_OVERSCAN_ROWS,
    prependCount,
  });

  // 6. Callbacks (useCallback calling pure helpers): none — see the shared
  // window; the scroll ref is already the referentially stable state setter.

  // 7. Effects
  // The bookkeeping refs update AFTER the shared window's compensation effect
  // has consumed this render's `prependCount` (effects flush in declaration
  // order, and the shared hook is called first), so a push is never recorded
  // before it was compensated.
  useEffect(() => {
    previousTotalRef.current = identities.length;
    previousHeadIdRef.current = identities[0]?.id ?? null;
  }, [identities]);

  return {
    bottomSpacerHeightPx: model.bottomSpacerHeightPx,
    scrollRef: model.scrollRef,
    topSpacerHeightPx: model.topSpacerHeightPx,
    windowedRows: model.visibleItems,
  };
}

/**
 * Counts how many rows entered at the head since the previous pass.
 *
 * Transactions merge pushes straight into one buffer, so the head insertions
 * are recovered by locating the previously newest row: everything above it is
 * new. A row that is no longer present (a filter reload replaced the whole
 * buffer) prepends nothing — that is a fresh query, not an insertion — and
 * neither does an in-place terminal update, which leaves the head where it
 * was.
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

  return Math.max(previousHeadIndex, 0);
}
