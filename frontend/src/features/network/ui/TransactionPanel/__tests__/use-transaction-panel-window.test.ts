import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RefCallback } from 'react';
import type { CaptureRow } from '../../../../../shared/contracts/capture.types';
import type { TransactionPanelWindowModel } from '../transaction-panel.types';
import { useTransactionPanelWindow } from '../use-transaction-panel-window';

/**
 * Row-height estimate the virtual window runs on, in px. Must mirror
 * TRANSACTION_ROW_HEIGHT_ESTIMATE_PX: written as a literal on purpose so the
 * spacer math these tests pin cannot drift with the production constant.
 */
const ROW_HEIGHT_PX = 36;

/**
 * Viewport the hook assumes before a real measurement arrives (jsdom measures
 * the container at 0x0, and the hook maps that to this deterministic rect).
 * Must mirror TRANSACTION_VIRTUAL_INITIAL_VIEWPORT_PX.height.
 */
const VIEWPORT_HEIGHT_PX = 600;

/** Builds one capture row, overridable field by field per test. */
function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1_000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids and descending timestamps. */
function rows(count: number, offset = 0): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({ requestId: `req-${offset + index}`, capturedAtMs: 100_000 - offset - index }),
  );
}

/** Attaches a detached scroll container to the hook's scrollRef so the virtualizer can observe it. */
function attachScroller(result: { current: Pick<TransactionPanelWindowModel, 'scrollRef'> }): HTMLDivElement {
  const element = document.createElement('div');

  act(() => {
    (result.current.scrollRef as RefCallback<HTMLDivElement>)(element);
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

/** Prepends one live capture row to the buffer, exactly like a pushed capture does. */
function pushLiveRow(current: readonly CaptureRow[]): readonly CaptureRow[] {
  return [row({ requestId: 'req-live', capturedAtMs: 200_000 }), ...current];
}

/** Replaces the whole buffer with unrelated rows, exactly like a filter reload does. */
function replaceBuffer(_current: readonly CaptureRow[]): readonly CaptureRow[] {
  return rows(2, 9_000);
}

/**
 * One compensation scenario for the live head-insertion effect: where the rail
 * sits, whether a scroll element is attached, the buffer transform under test,
 * and the offset the effect must leave behind (`null` when no element exists).
 */
interface CompensationScenario {
  /** Human-readable row name for the Vitest output. */
  readonly name: string;
  /** Offset the rail sits at before the buffer transform. */
  readonly scrollTop: number;
  /** Whether a scroll container is attached before the transform runs. */
  readonly attach: boolean;
  /** Maps the loaded buffer to the buffer the effect observes next. */
  readonly nextItems: (current: readonly CaptureRow[]) => readonly CaptureRow[];
  /** Expected `scrollTop` after the effect, or `null` when no element exists. */
  readonly expectedScrollTop: number | null;
}

/** The compensation matrix: away-from-top vs top, prepend vs reload, element present vs absent. */
const COMPENSATION_SCENARIOS: readonly CompensationScenario[] = [
  {
    name: 'moves the offset down by exactly the prepended height for a live push away from the top',
    scrollTop: 800,
    attach: true,
    nextItems: pushLiveRow,
    expectedScrollTop: 800 + ROW_HEIGHT_PX,
  },
  {
    name: 'leaves the offset at the top where the pushed arrivals are the content to read',
    scrollTop: 0,
    attach: true,
    nextItems: pushLiveRow,
    expectedScrollTop: 0,
  },
  {
    name: 'moves nothing when a filter reload replaces the whole buffer and prepends nothing',
    scrollTop: 800,
    attach: true,
    nextItems: replaceBuffer,
    expectedScrollTop: 800,
  },
  {
    name: 'survives a live push before any scroll element is attached',
    scrollTop: 0,
    attach: false,
    nextItems: pushLiveRow,
    expectedScrollTop: null,
  },
];

describe('useTransactionPanelWindow', () => {
  it('renders only the bounded virtual window while thousands of rows are loaded', () => {
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(2_000), onReachEnd: vi.fn() }));

    expect(result.current.windowedRows.length).toBeGreaterThan(0);
    expect(result.current.windowedRows.length).toBeLessThanOrEqual(100);
    expect(result.current.windowedRows[0]?.requestId).toBe('req-0');
  });

  it('returns spacer heights that account for every loaded row', () => {
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(2_000), onReachEnd: vi.fn() }));

    const mounted = result.current.windowedRows.length;

    expect(
      result.current.topSpacerHeightPx + result.current.bottomSpacerHeightPx + mounted * ROW_HEIGHT_PX,
    ).toBe(2_000 * ROW_HEIGHT_PX);
  });

  it('mounts the row the user scrolled to and unmounts the top rows', () => {
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(2_000), onReachEnd: vi.fn() }));
    const element = attachScroller(result);

    scrollTo(element, 1_500 * ROW_HEIGHT_PX);

    const ids = result.current.windowedRows.map((item) => item.requestId);

    expect(ids).toContain('req-1500');
    expect(ids).not.toContain('req-0');
    // The top spacer carries everything above the window, which starts one
    // overscan band before the scrolled index.
    expect(result.current.topSpacerHeightPx).toBe((1_500 - 5) * ROW_HEIGHT_PX);
    expect(result.current.windowedRows.length).toBeLessThanOrEqual(100);
  });

  it('asks for nothing at mount even when a short page already touches the end of the window', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(3), onReachEnd }));

    // Attached ON PURPOSE: the range only exists once the virtualizer has a
    // scroll element, and 3 rows at 36 px never fill the 600 px viewport — so
    // even a mount-time range that touches the last loaded row must not page
    // before the user has actually scrolled.
    attachScroller(result);

    expect(onReachEnd).not.toHaveBeenCalled();
  });

  it('asks the backend once the virtual range reaches the last loaded row', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(30), onReachEnd }));
    const element = attachScroller(result);

    scrollTo(element, 29 * ROW_HEIGHT_PX);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('does not fetch while the scrolled range sits away from the last loaded row', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(30), onReachEnd }));
    const element = attachScroller(result);

    // Ten rows down: the range covers rows 2-18 at most, nowhere near row 29.
    scrollTo(element, 10 * ROW_HEIGHT_PX);

    expect(onReachEnd).not.toHaveBeenCalled();

    scrollTo(element, 29 * ROW_HEIGHT_PX);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('asks again only when the range itself moves, not on every scroll event at the end', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(30), onReachEnd }));
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
    const loaded = rows(30);
    const { result, rerender } = renderHook(
      (items: readonly CaptureRow[]) => useTransactionPanelWindow({ items, onReachEnd }),
      { initialProps: loaded },
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

      rerender([]);

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

  it.each(COMPENSATION_SCENARIOS)('$name', ({ attach, expectedScrollTop, nextItems, scrollTop }) => {
    const loaded = rows(60);
    const { result, rerender } = renderHook(
      (items: readonly CaptureRow[]) => useTransactionPanelWindow({ items, onReachEnd: vi.fn() }),
      { initialProps: loaded },
    );
    const element = attach ? attachScroller(result) : null;

    if (element !== null) {
      act(() => {
        element.scrollTop = scrollTop;
      });
    }

    rerender(nextItems(loaded));

    expect(element === null ? null : element.scrollTop).toBe(expectedScrollTop);
  });

  it('keeps the reading set under the window after a compensated push', () => {
    const loaded = rows(60);
    const { result, rerender } = renderHook(
      (items: readonly CaptureRow[]) => useTransactionPanelWindow({ items, onReachEnd: vi.fn() }),
      { initialProps: loaded },
    );
    const element = attachScroller(result);

    act(() => {
      element.scrollTop = 800;
    });

    rerender(pushLiveRow(loaded));

    // jsdom fires no scroll event for the programmatic offset write, so the
    // event is fired by hand — a real engine dispatches it itself and the
    // virtualizer resyncs to the compensated offset before paint.
    act(() => {
      fireEvent.scroll(element);
    });

    // The window at the compensated offset covers exactly the reading set the
    // user had at the old offset (items[17..43] before, items[18..44] after,
    // the same rows), and the pushed row is nowhere in it.
    const ids = result.current.windowedRows.map((item) => item.requestId);

    expect(ids).not.toContain('req-live');
    expect(ids).toContain('req-17');
    expect(ids).toContain('req-43');
  });

  it('keeps the window inside the viewport band the deterministic initial rect gives', () => {
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(60), onReachEnd: vi.fn() }));

    // 600 px at 36 px per row is 17 visible rows; one overscan band grows the
    // mount to at most 17 + 5 + 5. Pinned as a literal so a silent change to
    // the estimate, the viewport, or the overscan shows up here.
    expect(result.current.windowedRows.length).toBeLessThanOrEqual(27);
    expect(result.current.windowedRows.length).toBeGreaterThan(0);
  });

  it('exposes a scroll ref that is stable across renders', () => {
    const { result, rerender } = renderHook(() => useTransactionPanelWindow({ items: rows(3), onReachEnd: vi.fn() }));

    const first = result.current.scrollRef;
    rerender();

    expect(result.current.scrollRef).toBe(first);
  });

  it('renders the whole load when it is shorter than the virtual viewport', () => {
    const { result } = renderHook(() =>
      useTransactionPanelWindow({ items: rows(VIEWPORT_HEIGHT_PX / ROW_HEIGHT_PX), onReachEnd: vi.fn() }),
    );

    // 16 rows at 36 px = 576 px < 600 px viewport: the window is the load.
    expect(result.current.windowedRows).toHaveLength(16);
    expect(result.current.bottomSpacerHeightPx).toBe(0);
  });
});
