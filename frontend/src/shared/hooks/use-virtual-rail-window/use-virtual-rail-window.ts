import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Rect } from '@tanstack/react-virtual';
import { VIRTUAL_RAIL_INITIAL_VIEWPORT_PX } from './virtual-rail-window.constants';
import type { VirtualRailWindowInput, VirtualRailWindowModel } from './use-virtual-rail-window.types';

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
  return rect.height === 0 ? VIRTUAL_RAIL_INITIAL_VIEWPORT_PX : rect;
}

/**
 * Owns one Activity rail's VIRTUAL window over its loaded rows.
 *
 * **The rails are LIVE** (ADR-012, live branch): pushes insert rows at the
 * head while the user reads. The window is therefore a `useVirtualizer` over
 * the LOADED rows rather than the shared `useProgressiveListWindow` — that
 * hook's render-phase reset would snap the user back to the first batch on
 * every pushed row — and only the rows the virtualizer reports in view (plus
 * a small overscan) mount at all. The top and bottom spacer heights carry the
 * unrendered content, so the scrollbar stays honest while the mounted row
 * count stays bounded however many pages the user has paged through.
 *
 * Load-more fires when the virtual range reaches the last loaded row, and ONLY
 * once the user has actually scrolled: at mount the range can already touch
 * the end (a page shorter than the viewport measures that way), and firing
 * then would page the rail on its own. An exhausted cursor is already a no-op
 * inside the rail's load-more, so the trigger needs no second copy of that
 * decision.
 *
 * A live push is a head insertion: every loaded row shifts down one row
 * height in content space, and the rail reports the insertion through
 * `prependCount`. While the user has scrolled away from the top, the scroll
 * offset is compensated by the prepended height so the content they were
 * reading stays under their eyes (the offset moves WITH the content — that is
 * what "the scroll must not jump" means for a virtualized rail). At the very
 * top the new arrivals ARE the content to read, so no compensation runs
 * there — DevTools behavior. A filter reload replaces the whole buffer and
 * prepends nothing.
 *
 * jsdom note: a bare test element measures 0 px high, so the rect resolution
 * maps that to the deterministic 1024x600 viewport, and jsdom fires no scroll
 * event for a programmatic offset write — tests drive the window with mocked
 * `scrollTop` plus explicit scroll events. A real engine measures the true
 * rect synchronously on attach and dispatches the scroll itself.
 * @param input The loaded rows, the layout constants, the detected head insertions, and the load-more trigger.
 * @returns The in-view rows, the spacer heights, and the scroll ref.
 */
export function useVirtualRailWindow<T>(input: Readonly<VirtualRailWindowInput<T>>): VirtualRailWindowModel<T> {
  const { estimateSizePx, items, onReachEnd, overscan, prependCount } = input;

  // 1. Refs
  // Distinguishes a mount-time range (which may already touch the end on a
  // short page) from a scroll-driven one. Read inside the virtualizer's
  // onChange, where load-more lives.
  const hasScrolledRef = useRef(false);

  // 2. State
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  // 3. Context/3rd Party Hooks
  const virtualizer = useVirtualizer({
    count: items.length,
    // Constant estimate on purpose — see VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX
    // (and each rail's own recorded drift note) for the measured band and the
    // recorded drift risk.
    estimateSize: () => estimateSizePx,
    getScrollElement: () => scrollElement,
    initialRect: VIRTUAL_RAIL_INITIAL_VIEWPORT_PX,
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
      // there. Repeat calls while parked at the end are no-ops inside the
      // rail's load-more (in-flight guard, exhausted cursor).
      if (range.endIndex >= instance.options.count - 1) {
        onReachEnd();
      }
    },
    overscan,
  });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const topSpacerHeightPx = firstVirtualItem === undefined ? 0 : firstVirtualItem.start;
  const bottomSpacerHeightPx = lastVirtualItem === undefined ? 0 : virtualizer.getTotalSize() - lastVirtualItem.end;
  const visibleItems = useMemo(
    () => virtualItems.map((virtualItem) => items[virtualItem.index]),
    [items, virtualItems],
  );

  // 6. Callbacks (useCallback calling pure helpers): none — React's setState is
  // already referentially stable, so the scroll ref IS the state setter below;
  // a useCallback wrapper around it would only add a dep array for a mutator
  // to weaken without changing any behavior.

  // 7. Effects
  useEffect(() => {
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
    //
    // The dep is the BUFFER itself, not just the count: two successive
    // single-row pushes each report `prependCount === 1`, and a count-only dep
    // would silently skip the second compensation.
    scrollElement.scrollTop += prependCount * estimateSizePx;
  }, [estimateSizePx, items, prependCount, scrollElement]);

  return { bottomSpacerHeightPx, scrollRef: setScrollElement, topSpacerHeightPx, visibleItems };
}
