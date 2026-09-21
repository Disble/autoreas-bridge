import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Rect } from '@tanstack/react-virtual';
import {
  TRANSACTION_ROW_HEIGHT_ESTIMATE_PX,
  TRANSACTION_VIRTUAL_INITIAL_VIEWPORT_PX,
  TRANSACTION_VIRTUAL_OVERSCAN_ROWS,
} from './transaction-panel.constants';
import type { TransactionPanelWindowInput, TransactionPanelWindowModel } from './transaction-panel.types';

/**
 * Resolves one measured scroll-container rect onto the viewport the virtual
 * window runs on. Only the HEIGHT drives the vertical window, and a
 * zero-height measurement (a bare jsdom element, or a rail observed before
 * its first layout pass) would produce an EMPTY virtual window, so it is
 * substituted by the deterministic initial viewport.
 * @param rect The measured scroll-container rect.
 * @returns The viewport the virtual window runs on.
 */
function resolveWindowViewport(rect: Readonly<Rect>): Rect {
  return rect.height === 0 ? TRANSACTION_VIRTUAL_INITIAL_VIEWPORT_PX : rect;
}

/**
 * Owns the Transactions rail's VIRTUAL window.
 *
 * **This rail is LIVE** (ADR-012, live branch): the `capture.transaction` push
 * inserts arrival and terminal rows at the head while the user reads. The
 * window is therefore a `useVirtualizer` over the LOADED rows rather than the
 * shared `useProgressiveListWindow` — that hook's render-phase reset would
 * snap the user back to the first batch on every pushed capture — and only the
 * rows the virtualizer reports in view (plus a small overscan) mount at all.
 * The top and bottom spacer heights carry the unrendered content, so the
 * scrollbar stays honest while the mounted row count stays bounded however
 * many pages the user has paged through.
 *
 * Load-more fires when the virtual range reaches the last loaded row, and ONLY
 * once the user has actually scrolled: at mount the range can already touch
 * the end (a page shorter than the viewport measures that way), and firing
 * then would page the rail on its own. An exhausted cursor is already a no-op
 * inside `loadMore`, so the trigger needs no second copy of that decision.
 *
 * A live push is a head insertion: every loaded row shifts down one row
 * height in content space. While the user has scrolled away from the top, the
 * scroll offset is compensated by the prepended height so the content they
 * were reading stays under their eyes (the offset moves WITH the content —
 * that is what "the scroll must not jump" means for a virtualized rail). At
 * the very top the new arrivals ARE the content to read, so no compensation
 * runs there — DevTools behavior. A filter reload replaces the whole buffer
 * and prepends nothing.
 *
 * jsdom note: a bare test element measures 0 px high, so the rect resolution
 * maps that to the deterministic 1024x600 viewport, and jsdom fires no scroll
 * event for a programmatic offset write — tests drive the window with mocked
 * `scrollTop` plus explicit scroll events. A real engine measures the true
 * rect synchronously on attach and dispatches the scroll itself.
 * @param input The loaded rows and the load-more trigger.
 * @returns The in-view rows, the spacer heights, and the scroll ref.
 */
export function useTransactionPanelWindow(input: Readonly<TransactionPanelWindowInput>): TransactionPanelWindowModel {
  const { items, onReachEnd } = input;

  // 1. Refs
  const previousTotalRef = useRef(0);
  const previousHeadIdRef = useRef<string | null>(null);
  // Distinguishes a mount-time range (which may already touch the end on a
  // short page) from a scroll-driven one. Read inside the virtualizer's
  // onChange, where load-more lives.
  const hasScrolledRef = useRef(false);

  // 2. State
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  // 3. Context/3rd Party Hooks
  const virtualizer = useVirtualizer({
    count: items.length,
    // Constant estimate on purpose — see TRANSACTION_ROW_HEIGHT_ESTIMATE_PX
    // for the measured band and the recorded drift risk.
    estimateSize: () => TRANSACTION_ROW_HEIGHT_ESTIMATE_PX,
    getScrollElement: () => scrollElement,
    initialRect: TRANSACTION_VIRTUAL_INITIAL_VIEWPORT_PX,
    // Local rect observer: tanstack never invokes it while the scroll element
    // is absent (virtual-core bails before calling it), so there is no
    // absent-element branch to guard here. The measurement is emitted
    // synchronously on attach — a rail no longer renders an empty window
    // between mount and its first resize callback — and later resizes go
    // through the exact same viewport resolution.
    observeElementRect: (instance, cb) => {
      // virtual-core only invokes this observer after the scroll element is
      // attached (it bails on a null element before calling it), so the
      // element is non-null here by contract; the cast encodes that guarantee
      // instead of an unreachable guard branch.
      const element = instance.scrollElement as HTMLDivElement;
      const measure = (): Rect => ({ width: element.offsetWidth, height: element.offsetHeight });
      const emit = (rect: Rect): void => {
        cb(resolveWindowViewport(rect));
      };

      emit(measure());

      const targetWindow = instance.targetWindow;

      if (targetWindow === null || targetWindow.ResizeObserver === undefined) {
        return;
      }

      const observer = new targetWindow.ResizeObserver(() => emit(measure()));

      observer.observe(element, { box: 'border-box' });

      return () => {
        observer.unobserve(element);
      };
    },
    onChange: (instance) => {
      if (instance.isScrolling) {
        hasScrolledRef.current = true;
      }

      // Load-more lives here rather than in an effect: the notify that reports
      // the range IS the moment the rail reached its end, and a passive-effect
      // pass can land out of order with the scroll bookkeeping.
      if (!hasScrolledRef.current) {
        return;
      }

      const range = instance.range;

      // A rail with zero loaded rows reports NO range: nothing is visible, so
      // there is no end to reach and the empty rail stays silent.
      if (range === null) {
        return;
      }

      // `>=` on purpose: the range landing exactly on the last loaded row is
      // the end of the rail, and a `>` boundary would leave the rail silent
      // there. Repeat calls while parked at the end are no-ops inside
      // `loadMore` (in-flight guard, exhausted cursor).
      if (range.endIndex >= instance.options.count - 1) {
        onReachEnd();
      }
    },
    overscan: TRANSACTION_VIRTUAL_OVERSCAN_ROWS,
  });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const identities = useMemo(() => items.map((item) => ({ id: item.requestId })), [items]);
  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const topSpacerHeightPx = firstVirtualItem === undefined ? 0 : firstVirtualItem.start;
  const bottomSpacerHeightPx =
    lastVirtualItem === undefined ? 0 : virtualizer.getTotalSize() - lastVirtualItem.end;
  const windowedRows = useMemo(
    () => virtualItems.map((virtualItem) => items[virtualItem.index]),
    [items, virtualItems],
  );

  // 6. Callbacks (useCallback calling pure helpers): none — React's setState is
  // already referentially stable, so the scroll ref IS the state setter below;
  // a useCallback wrapper around it would only add a dep array for a mutator
  // to weaken without changing any behavior.

  // 7. Effects
  useEffect(() => {
    const previousTotal = previousTotalRef.current;
    const prependedCount = countPrependedRows(identities, previousHeadIdRef.current, previousTotal);

    previousTotalRef.current = identities.length;
    previousHeadIdRef.current = identities[0]?.id ?? null;

    // One observable guard per early return, exact equality against a state a
    // test can set both ways. There is deliberately NO guard for a zero
    // prepend: adding 0 px is a no-op, so the guard's two sides are
    // indistinguishable by construction — the mutation gate proved the guard
    // redundant, and the offset write below is harmless for the same reason.
    if (scrollElement === null) {
      return;
    }

    if (scrollElement.scrollTop === 0) {
      return;
    }

    // A head insertion shifts the whole content down by the prepended height,
    // so the offset follows it and the reading position stays put. At the top
    // (scrollTop 0) the arrivals are the content — no compensation. A
    // programmatic offset write fires a real scroll event in a real engine,
    // which resyncs the virtualizer before paint.
    scrollElement.scrollTop += prependedCount * TRANSACTION_ROW_HEIGHT_ESTIMATE_PX;
  }, [identities, scrollElement]);

  return { bottomSpacerHeightPx, scrollRef: setScrollElement, topSpacerHeightPx, windowedRows };
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
