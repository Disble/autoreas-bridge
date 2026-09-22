import { useEffect, useMemo, useRef } from 'react';
import {
  VIRTUAL_RAIL_OVERSCAN_ROWS,
  VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX,
} from '../../../../shared/hooks/use-virtual-rail-window/virtual-rail-window.constants';
import { useVirtualRailWindow } from '../../../../shared/hooks/use-virtual-rail-window/use-virtual-rail-window';
import { mergeEventFeed } from './network-feed.helpers';
import type { EventFeedState, RuntimeEventRow } from './network-panel.types';

/** Everything the virtual window needs from the feed. */
interface NetworkPanelWindowInput {
  readonly feed: Pick<EventFeedState, 'page' | 'overlay'>;
  /** Called when the virtual range reaches the last loaded row, so the next cursor page can be fetched. */
  readonly onReachEnd: () => void;
}

/**
 * Owns the Runtime Events rail's VIRTUAL window by delegating to the shared
 * `useVirtualRailWindow` — the virtualizer, the deterministic viewport
 * fallback, the load-more trigger and the head-insertion compensation all
 * live there now.
 *
 * **This rail is LIVE** (ADR-012, live branch): a runtime-event push enters
 * at the head while the user reads. The one thing that stays rail-specific is
 * detecting THIS rail's head insertions: the overlay only ever grows at the
 * head (admission is unchanged), so the growth of `feed.overlay.length` since
 * the previous pass IS the prepended count. A filter reload clears the
 * overlay and replaces the page — a shrink, clamped to zero, prepends
 * nothing.
 *
 * The batch's ORIGIN is the only thing that differs from the in-memory rails:
 * once the virtual range reaches the last loaded row, the next batch is the
 * next backend cursor page rather than a slice of a local buffer.
 * @param input The feed halves and the load-more trigger.
 * @returns The merged feed, the in-view rows, the spacer heights, and the scroll ref.
 */
export function useNetworkPanelWindow(input: Readonly<NetworkPanelWindowInput>): {
  rows: readonly RuntimeEventRow[];
  windowedRows: readonly RuntimeEventRow[];
  topSpacerHeightPx: number;
  bottomSpacerHeightPx: number;
  scrollRef: (element: HTMLDivElement | null) => void;
} {
  const { feed, onReachEnd } = input;

  // 1. Refs
  const previousOverlayCountRef = useRef(0);

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const rows = useMemo(() => mergeEventFeed(feed.overlay, feed.page), [feed.overlay, feed.page]);
  // The overlay shrinks only when a filter reload clears it; clamping to zero
  // keeps that reload from compensating the offset backwards. The bookkeeping
  // ref updates AFTER the shared window's compensation effect has consumed
  // this render's count (effects flush in declaration order, and the shared
  // hook is called first), so a push is never recorded before it was
  // compensated.
  const prependCount = Math.max(0, feed.overlay.length - previousOverlayCountRef.current);
  const model = useVirtualRailWindow({
    estimateSizePx: VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX,
    items: rows,
    onReachEnd,
    overscan: VIRTUAL_RAIL_OVERSCAN_ROWS,
    prependCount,
  });

  // 6. Callbacks (useCallback calling pure helpers): none — see the shared
  // window; the scroll ref is already the referentially stable state setter.

  // 7. Effects
  useEffect(() => {
    previousOverlayCountRef.current = feed.overlay.length;
  }, [feed.overlay.length]);

  return {
    bottomSpacerHeightPx: model.bottomSpacerHeightPx,
    rows,
    scrollRef: model.scrollRef,
    topSpacerHeightPx: model.topSpacerHeightPx,
    windowedRows: model.visibleItems,
  };
}
