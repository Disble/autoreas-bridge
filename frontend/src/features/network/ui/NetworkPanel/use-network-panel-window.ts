import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import { mergeEventFeed, reconcileVisibleEventCount } from './network-feed.helpers';
import { EVENT_PAGE_INITIAL_COUNT, EVENT_PAGE_SIZE } from './network-panel.constants';
import type { EventFeedState, RuntimeEventRow } from './network-panel.types';

/** Everything the live window needs from the feed and the current selection. */
interface NetworkPanelWindowInput {
  readonly feed: Pick<EventFeedState, 'page' | 'overlay'>;
  readonly selectedId: string | null;
  /** Called when the growth would run past the loaded rows, so the next cursor page can be fetched. */
  readonly onReachEnd: () => void;
}

/**
 * Owns the Runtime Events rail's visible window.
 *
 * **This rail is LIVE** (ADR-012, live branch): an event stream pushes rows in
 * at the head while the user reads. It therefore does NOT use
 * `useProgressiveListWindow` — that hook's render-phase reset would snap the
 * user back to the first batch on every pushed event — and reuses only
 * `isNearListBottom` for the scroll trigger. Rows are appended and never
 * unmounted, so the scrollbar starts short and grows honestly; there is no
 * windowing, no virtualization and no `Virtualizer`/`ListLayout`.
 *
 * The one thing this rail adds beyond the shared invariants is
 * `prependedCount`: a head insertion shifts every rendered row down one index,
 * so holding the count constant would silently drop the bottom visible row on
 * every single event (design §4.1).
 *
 * The batch's ORIGIN is the only thing that differs from the in-memory rails:
 * once the window has consumed every loaded row, the next batch is the next
 * backend cursor page rather than a slice of a local buffer.
 * @param input The feed halves, the current selection, and the load-more trigger.
 * @returns The merged feed, the windowed slice, its size, and the scroll handler.
 */
export function useNetworkPanelWindow(input: Readonly<NetworkPanelWindowInput>) {
  const { feed, selectedId, onReachEnd } = input;

  // 1. Refs
  const previousTotalRef = useRef(0);
  const previousOverlayCountRef = useRef(0);

  // 2. State
  const [visibleCount, setVisibleCount] = useState(EVENT_PAGE_INITIAL_COUNT);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const rows = useMemo(() => mergeEventFeed(feed.overlay, feed.page), [feed.overlay, feed.page]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;

      if (!isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        return;
      }

      setVisibleCount(Math.min(rows.length, visibleCount + EVENT_PAGE_SIZE));

      if (visibleCount + EVENT_PAGE_SIZE >= rows.length) {
        onReachEnd();
      }
    },
    [onReachEnd, rows.length, visibleCount],
  );

  // 7. Effects
  useEffect(() => {
    // Both bookkeeping values are read into locals BEFORE the updater is
    // queued. React may run a state updater eagerly or defer it, so reading
    // `previousTotalRef.current` from inside the closure would sometimes see
    // the value the two lines below have already overwritten — and rule 3
    // ("a fully revealed feed stays revealed") would silently stop firing on
    // an appended cursor page.
    const previousTotal = previousTotalRef.current;
    const prependedCount = Math.max(0, feed.overlay.length - previousOverlayCountRef.current);

    previousTotalRef.current = rows.length;
    previousOverlayCountRef.current = feed.overlay.length;

    setVisibleCount((currentVisibleCount) =>
      reconcileVisibleEventCount({
        currentVisibleCount,
        previousTotal,
        nextRows: rows,
        selectedId,
        prependedCount,
        initialCount: EVENT_PAGE_INITIAL_COUNT,
      }),
    );
  }, [feed.overlay.length, rows, selectedId]);

  return {
    rows,
    visibleRows,
    visibleCount,
    onScroll,
  } satisfies {
    rows: readonly RuntimeEventRow[];
    visibleRows: readonly RuntimeEventRow[];
    visibleCount: number;
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
  };
}
