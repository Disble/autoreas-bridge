import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEventRow } from '../../../../../shared/store/network-store/network-store.types';
import { useNetworkPanelWindow } from '../use-network-panel-window';

/**
 * Window contract of the Runtime Events rail, re-specified 2026-09-21 when
 * the rail's grow-only window (`visibleCount` growing by `EVENT_PAGE_SIZE`
 * batches through an `onScroll` handler, reconciled by
 * `reconcileVisibleEventCount`) was replaced by the shared virtual window.
 * Rows whose names say "re-specified" replaced a grow-only rule that no
 * longer exists; nothing was deleted silently:
 *
 * - "renders exactly one batch on first render" → the mounted window is
 *   BOUNDED by the viewport, not a batch size.
 * - "grows by one batch when the user scrolls near the bottom" → the
 *   `onScroll` handler is gone; scrolling moves the virtual window.
 * - "leaves the window alone while the user is still far from the bottom" →
 *   scrolling far down mounts THAT region and unmounts the top.
 * - "asks for the next cursor page only once the growth would run past the
 *   loaded rows" → load-more fires when the virtual range reaches the last
 *   loaded row, gated against self-paging at mount.
 * - "grows the window by exactly one when a live push enters at the head" →
 *   the window no longer grows; the scroll offset is compensated by the
 *   prepended height instead.
 * - "keeps a fully revealed feed revealed when an older cursor page is
 *   appended" → a fully revealed feed is no longer a rule; an appended page
 *   stays unrendered inside the spacers until the user scrolls to it.
 * - "keeps the selected row rendered even when it sits past the current
 *   window" (the window extended to the selected row) → deliberately gone:
 *   under virtualization the selected row may unmount and the selection
 *   survives in the store, exactly as the Transactions rail does. Covered
 *   behaviorally by NetworkPanel.windowing.test.tsx.
 */

/**
 * Row-height estimate the virtual window runs on, in px. Must mirror
 * VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX: written as a literal on purpose so the
 * spacer math these tests pin cannot drift with the production constant.
 */
const ROW_HEIGHT_PX = 36;

/**
 * Viewport the hook assumes before a real measurement arrives (jsdom measures
 * the container at 0x0, and the hook maps that to this deterministic rect).
 * Must mirror VIRTUAL_RAIL_INITIAL_VIEWPORT_PX.height.
 */
const VIEWPORT_HEIGHT_PX = 600;

/** The feed halves one window pass reads. */
interface FeedProps {
  readonly page: readonly RuntimeEventRow[];
  readonly overlay: readonly RuntimeEventRow[];
}

/** Builds `count` newest-first persisted rows with distinct ids and descending timestamps. */
function page(count: number, offset = 0): readonly RuntimeEventRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `event-${offset + index}`,
    occurredAtMs: 10_000 - (offset + index),
    domain: 'sync',
    level: 'info',
    message: `event ${offset + index}`,
  }));
}

/** Builds one live-pushed overlay row, newer than every persisted row above. */
function overlayRow(id: string, occurredAtMs: number): RuntimeEventRow {
  return { id, occurredAtMs, domain: 'api', level: 'info', message: `pushed ${id}` };
}

/** Attaches a detached scroll container to the hook's scrollRef so the virtualizer can observe it. */
function attachScroller(result: { current: { scrollRef: (element: HTMLDivElement | null) => void } }): HTMLDivElement {
  const element = document.createElement('div');

  act(() => {
    result.current.scrollRef(element);
  });

  return element;
}

/** Moves the scroller to `scrollTop` and fires the scroll event the virtualizer observes. */
function scrollTo(element: HTMLDivElement, scrollTop: number): void {
  act(() => {
    element.scrollTop = scrollTop;
    fireEvent.scroll(element);
  });
}

/**
 * One compensation scenario for the live head-insertion effect: where the rail
 * sits, whether a scroll element is attached, the ordered feed transforms under
 * test (each one rerendered so the effects flush between steps), and the offset
 * the effect must leave behind after each step (`null` when no element exists).
 */
interface CompensationScenario {
  /** Human-readable row name for the Vitest output. */
  readonly name: string;
  /** Offset the rail sits at before the first feed transform. */
  readonly scrollTop: number;
  /** Whether a scroll container is attached before the transform runs. */
  readonly attach: boolean;
  /** The feed the hook starts from. */
  readonly before: FeedProps;
  /** Ordered feed transforms; each one rerenders so the bookkeeping effect flushes between steps. */
  readonly steps: readonly ((current: FeedProps) => FeedProps)[];
  /** Expected `scrollTop` after each step, aligned with `steps` (`null` when no element exists). */
  readonly expectedScrollTops: readonly (number | null)[];
}

/** Prepends one live push to the overlay, exactly like an admitted runtime event does. */
function pushLiveOverlay(current: FeedProps): FeedProps {
  return { ...current, overlay: [overlayRow('overlay-live', 99_999), ...current.overlay] };
}

/** Replaces the whole feed, exactly like a filter reload clears the overlay and re-queries. */
function reloadFeed(current: FeedProps): FeedProps {
  return { page: page(2, 9_000), overlay: [] };
}

/** Prepends a second, distinct live push on top of the feed a previous step produced. */
function pushSecondLiveOverlay(current: FeedProps): FeedProps {
  return { ...current, overlay: [overlayRow('overlay-live-2', 100_000), ...current.overlay] };
}

/** The compensation matrix: away-from-top vs top, push vs reload, element present vs absent. */
const COMPENSATION_SCENARIOS: readonly CompensationScenario[] = [
  {
    name: 'moves the offset down by exactly the prepended height for a live push away from the top',
    scrollTop: 800,
    attach: true,
    before: { page: page(60), overlay: [] },
    steps: [pushLiveOverlay],
    expectedScrollTops: [800 + ROW_HEIGHT_PX],
  },
  {
    name: 'leaves the offset at the top where the pushed arrivals are the content to read',
    scrollTop: 0,
    attach: true,
    before: { page: page(60), overlay: [] },
    steps: [pushLiveOverlay],
    expectedScrollTops: [0],
  },
  {
    name: 'clamps a filter reload that clears the overlay to zero prepends and moves nothing',
    scrollTop: 800,
    attach: true,
    before: { page: page(60), overlay: [overlayRow('overlay-1', 99_999)] },
    steps: [reloadFeed],
    expectedScrollTops: [800],
  },
  {
    name: 'advances the offset by exactly one row per successive live push, not by the untracked overlay total',
    scrollTop: 800,
    attach: true,
    before: { page: page(60), overlay: [] },
    steps: [pushLiveOverlay, pushSecondLiveOverlay],
    expectedScrollTops: [800 + ROW_HEIGHT_PX, 800 + 2 * ROW_HEIGHT_PX],
  },
  {
    name: 'survives a live push before any scroll element is attached',
    scrollTop: 0,
    attach: false,
    before: { page: page(60), overlay: [] },
    steps: [pushLiveOverlay],
    expectedScrollTops: [null],
  },
];

describe('useNetworkPanelWindow', () => {
  it('renders only the bounded virtual window while thousands of rows are loaded', () => {
    // Re-specified: the old assertion was a batch size (visibleCount 20); the
    // new one is a ceiling over a load many times the window.
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(2_000), overlay: [] }, onReachEnd: vi.fn() }),
    );

    expect(result.current.windowedRows.length).toBeGreaterThan(0);
    expect(result.current.windowedRows.length).toBeLessThanOrEqual(100);
    expect(result.current.windowedRows[0]?.id).toBe('event-0');
  });

  it('returns spacer heights that account for every loaded row', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(2_000), overlay: [] }, onReachEnd: vi.fn() }),
    );

    const mounted = result.current.windowedRows.length;

    expect(
      result.current.topSpacerHeightPx + result.current.bottomSpacerHeightPx + mounted * ROW_HEIGHT_PX,
    ).toBe(2_000 * ROW_HEIGHT_PX);
  });

  it('mounts the row the user scrolled to and unmounts the top rows', () => {
    // Re-specified: "leaves the window alone while the user is still far from
    // the bottom" pinned a grow-only window; now scrolling far down moves the
    // window onto that region and the top rows leave the DOM.
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(2_000), overlay: [] }, onReachEnd: vi.fn() }),
    );
    const element = attachScroller(result);

    scrollTo(element, 1_500 * ROW_HEIGHT_PX);

    const ids = result.current.windowedRows.map((row) => row.id);

    expect(ids).toContain('event-1500');
    expect(ids).not.toContain('event-0');
    // The top spacer carries everything above the window, which starts one
    // overscan band before the scrolled index.
    expect(result.current.topSpacerHeightPx).toBe((1_500 - 5) * ROW_HEIGHT_PX);
    expect(result.current.windowedRows.length).toBeLessThanOrEqual(100);
  });

  it('asks for nothing at mount even when a short page already touches the end of the window', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(3), overlay: [] }, onReachEnd }),
    );

    // Attached ON PURPOSE: the range only exists once the virtualizer has a
    // scroll element, and 3 rows at 36 px never fill the 600 px viewport — so
    // even a mount-time range that touches the last loaded row must not page
    // before the user has actually scrolled.
    attachScroller(result);

    expect(onReachEnd).not.toHaveBeenCalled();
  });

  it('asks the backend once the virtual range reaches the last loaded row', () => {
    // Re-specified: the old trigger was the window's growth running past the
    // loaded rows; now it is the virtual range landing on the last one.
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(30), overlay: [] }, onReachEnd }),
    );
    const element = attachScroller(result);

    scrollTo(element, 29 * ROW_HEIGHT_PX);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('does not fetch while the scrolled range sits away from the last loaded row', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(30), overlay: [] }, onReachEnd }),
    );
    const element = attachScroller(result);

    // Ten rows down: the range covers rows 2-18 at most, nowhere near row 29.
    scrollTo(element, 10 * ROW_HEIGHT_PX);

    expect(onReachEnd).not.toHaveBeenCalled();

    scrollTo(element, 29 * ROW_HEIGHT_PX);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('asks again only when the range itself moves, not on every scroll event at the end', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(30), overlay: [] }, onReachEnd }),
    );
    const element = attachScroller(result);

    // 1044 and 1062 sit inside the same virtual row band, so both land the
    // range exactly on the last loaded row — the second event must not
    // re-trigger a fetch for the same position.
    scrollTo(element, 29 * ROW_HEIGHT_PX);
    scrollTo(element, 29.5 * ROW_HEIGHT_PX);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('stays silent without a virtual range when a scrolled rail empties to zero rows', async () => {
    const onReachEnd = vi.fn();
    const { result, rerender } = renderHook(
      (feed: FeedProps) => useNetworkPanelWindow({ feed, onReachEnd }),
      { initialProps: { page: page(30), overlay: [] } },
    );
    const element = attachScroller(result);

    // jsdom reports an exception thrown inside a scroll listener as a window
    // `error` event instead of failing the run, so the test captures them to
    // make the null-range pass a real assertion rather than a silent one.
    const windowErrors: ErrorEvent[] = [];
    const onError = (event: ErrorEvent): void => {
      windowErrors.push(event);
    };

    window.addEventListener('error', onError);

    try {
      scrollTo(element, 10 * ROW_HEIGHT_PX);

      // The scroll-end debounce (150 ms) resets isScrolling; afterwards an
      // empty result set (a filter that matches nothing) leaves the
      // virtualizer with NO range, and the next scroll-driven pass must
      // notify without a range, without fetching, and without throwing on
      // the null range.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      rerender({ page: [], overlay: [] });

      // A DIFFERENT offset is required here: the virtualizer's offset observer
      // swallows a scroll event whose offset equals the stored one, and only a
      // changed offset drives the notify that reports the empty rail's null
      // range.
      scrollTo(element, 12 * ROW_HEIGHT_PX);
    } finally {
      window.removeEventListener('error', onError);
    }

    expect(windowErrors).toHaveLength(0);
    expect(onReachEnd).not.toHaveBeenCalled();
    expect(result.current.windowedRows).toHaveLength(0);
  });

  it.each(COMPENSATION_SCENARIOS)('$name', ({ attach, before, expectedScrollTops, steps, scrollTop }) => {
    // Re-specified: the old rule answered a head insertion by growing the
    // visible count; now the scroll offset is compensated by the prepended
    // height instead, so the content moves WITH the offset.
    const { result, rerender } = renderHook(
      (feed: FeedProps) => useNetworkPanelWindow({ feed, onReachEnd: vi.fn() }),
      { initialProps: before },
    );
    const element = attach ? attachScroller(result) : null;

    if (element !== null) {
      act(() => {
        element.scrollTop = scrollTop;
      });
    }

    let current = before;
    steps.forEach((step, index) => {
      current = step(current);
      rerender(current);

      expect(element === null ? null : element.scrollTop).toBe(expectedScrollTops[index]);
    });
  });

  it('keeps the reading set under the window after a compensated push', () => {
    const { result, rerender } = renderHook(
      (feed: FeedProps) => useNetworkPanelWindow({ feed, onReachEnd: vi.fn() }),
      { initialProps: { page: page(60), overlay: [] as readonly RuntimeEventRow[] } },
    );
    const element = attachScroller(result);

    act(() => {
      element.scrollTop = 800;
    });

    rerender(pushLiveOverlay({ page: page(60), overlay: [] }));

    // jsdom fires no scroll event for the programmatic offset write, so the
    // event is fired by hand — a real engine dispatches it itself and the
    // virtualizer resyncs to the compensated offset before paint.
    act(() => {
      fireEvent.scroll(element);
    });

    // The window at the compensated offset covers exactly the reading set the
    // user had at the old offset (items[17..43] before, items[18..44] after,
    // the same rows), and the pushed row is nowhere in it.
    const ids = result.current.windowedRows.map((row) => row.id);

    expect(ids).not.toContain('overlay-live');
    expect(ids).toContain('event-17');
    expect(ids).toContain('event-43');
  });

  it('an appended cursor page reveals itself only by scrolling — the offset stays put', () => {
    // Re-specified: "keeps a fully revealed feed revealed" was a grow-only
    // rule; under the virtual contract the appended page is unrendered
    // spacer height until the user scrolls to it, and the window does not
    // move on its own. The buffer is taller than the viewport band so the
    // window is not bottom-clamped before the append — otherwise the appended
    // rows would legitimately enter the same band.
    const { result, rerender } = renderHook(
      (feed: FeedProps) => useNetworkPanelWindow({ feed, onReachEnd: vi.fn() }),
      { initialProps: { page: page(60), overlay: [] } },
    );
    const element = attachScroller(result);

    scrollTo(element, 5 * ROW_HEIGHT_PX);

    const beforeIds = result.current.windowedRows.map((row) => row.id);
    const beforeBottomSpacerPx = result.current.bottomSpacerHeightPx;

    rerender({ page: [...page(60), ...page(20, 60)], overlay: [] });

    expect(result.current.windowedRows.map((row) => row.id)).toEqual(beforeIds);
    expect(element.scrollTop).toBe(5 * ROW_HEIGHT_PX);
    expect(result.current.bottomSpacerHeightPx).toBe(beforeBottomSpacerPx + 20 * ROW_HEIGHT_PX);
  });

  it('presents the overlay ahead of the persisted page without reordering either half', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({
        feed: { page: page(3), overlay: [overlayRow('overlay-2', 99_999), overlayRow('overlay-1', 99_998)] },
        onReachEnd: vi.fn(),
      }),
    );

    expect(result.current.rows.map((row) => row.id)).toEqual(['overlay-2', 'overlay-1', 'event-0', 'event-1', 'event-2']);
  });

  it('exposes a scroll ref that is stable across renders', () => {
    const { result, rerender } = renderHook(
      (feed: FeedProps) => useNetworkPanelWindow({ feed, onReachEnd: vi.fn() }),
      { initialProps: { page: page(3), overlay: [] as readonly RuntimeEventRow[] } },
    );

    const first = result.current.scrollRef;
    rerender({ page: page(4), overlay: [] });

    expect(result.current.scrollRef).toBe(first);
  });

  it('renders the whole load when it is shorter than the virtual viewport', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(VIEWPORT_HEIGHT_PX / ROW_HEIGHT_PX), overlay: [] }, onReachEnd: vi.fn() }),
    );

    // 16 rows at 36 px = 576 px < 600 px viewport: the window is the load.
    expect(result.current.windowedRows).toHaveLength(16);
    expect(result.current.bottomSpacerHeightPx).toBe(0);
  });
});
