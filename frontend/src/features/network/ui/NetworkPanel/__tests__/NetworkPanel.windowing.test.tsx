import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventQuery } from '../../../../../shared/contracts/runtime-event.types';
import { getNetworkStoreState, resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';
import { createPushableSource, eventPage, records } from './network-panel.test-support';

/**
 * The Runtime Events rail is virtualized on the same shared window as the
 * Transactions rail: only the rows in view mount, spacer rows carry the
 * unrendered height, and load-more fires when the virtual range reaches the
 * last loaded row. jsdom's 0x0 rect falls back to a deterministic 1024x600
 * viewport — tighter than any real engine, so every ceiling here is honest.
 *
 * Re-specified 2026-09-21 when the grow-only window died. Rows whose names
 * say "re-specified" replaced the old grow-only contract; none was deleted
 * silently:
 *
 * - "renders exactly one batch on the first render" → the mounted window is
 *   BOUNDED by the viewport over a load many times that window.
 * - "grows by one batch on scroll-near-bottom and unmounts nothing already
 *   rendered" → the opposite: the window moves and top rows leave the DOM.
 * - "appends the next cursor page below the existing rows without unmounting
 *   any of them" → the next page is fetched at the virtual end and stays
 *   unrendered spacer height until the user scrolls onto it.
 * - "a pushed event grows the window by exactly one" → the window no longer
 *   grows; the scroll offset is compensated by the prepended height, so the
 *   reading set stays mounted and the pushed row is NOT in it until the user
 *   returns to the top.
 * - the old hook-level rule "keeps the selected row rendered even when it
 *   sits past the current window" (the window extended to the selected row)
 *   is covered here as its replacement: the selection survives in the STORE
 *   while its row may unmount.
 *
 * Consolidated for the mutation gate's per-test budget: tests that shared one
 * harness (one fake source, one render, scrolls) were merged into a single
 * test proving several properties in sequence. Every assertion, exact value,
 * and re-specification note survives; only redundant renders were removed.
 */

/** Row-height estimate in px; must mirror VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX, as a literal on purpose. */
const ROW_HEIGHT_PX = 36;

/** Overscan rows the production virtualizer runs with; must mirror VIRTUAL_RAIL_OVERSCAN_ROWS. */
const OVERSCAN_ROWS = 5;

/** Hard ceiling the virtual window must stay under however many rows are loaded. */
const MOUNTED_ROW_CEILING = 100;

/** A load above the mounted ceiling, so "bounded" cannot pass by accident. */
const LOADED_ROW_COUNT = 150;

/** Far-down row index the scroll test must reveal; stays inside the loaded fixture. */
const SCROLLED_INDEX = 140;

/** Flushes several microtask passes, so an unattended fetch loop has room to compound. */
async function settleAsyncPasses(passes = 5): Promise<void> {
  // Sequential by design: each pass lets the previous fetch's continuation run.
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Counts the event rows actually mounted, excluding the header and the spacer rows. */
function countRenderedRows(): number {
  return document.querySelectorAll('[data-network-scroll] tbody tr:not([data-network-spacer])').length;
}

/** Reads the message cell of every mounted row, in render order. */
function renderedMessages(): readonly string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-network-scroll] tbody tr td:nth-child(4)')).map(
    (cell) => cell.textContent ?? '',
  );
}

/** Returns the rail's scroll container, failing loudly when the panel did not render one. */
function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-network-scroll]');

  if (node === null) {
    throw new Error('the Runtime Events rail rendered no scroll container');
  }

  return node;
}

/** Reads a spacer row's rendered height in px, failing loudly when the spacer did not render. */
function spacerHeightPx(position: 'bottom' | 'top'): number {
  const spacer = document.querySelector<HTMLElement>(`[data-network-spacer="${position}"]`);

  if (spacer === null) {
    throw new Error(`the Runtime Events rail rendered no "${position}" spacer row`);
  }

  return Number.parseFloat(spacer.style.height);
}

/** Installs mocked scrollTop on the rail and fires the scroll event the virtualizer observes. */
function scrollToOffset(scrollTop: number) {
  const node = scroller();
  const state = { scrollTop };
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });
  fireEvent.scroll(node);

  return state;
}

describe('NetworkPanel virtual window (live rail)', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('mounts a bounded virtual window over the whole loaded page, keeps the scrollbar honest, and moves the window on scroll without re-querying', async () => {
    // One harness, three properties (consolidated from three tests sharing
    // the same 150-row load, render, and scrolls). Re-specified 2026-09-21:
    // the rail used to mount a 20-row batch and grow it; the approved
    // contract is the opposite — the first window is a ceiling over a load
    // many times that ceiling, the spacers carry every unrendered height, and
    // scrolling far down moves the window (top rows leave the DOM) instead of
    // growing it "without unmounting anything".
    const consoleErrors: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });
    const searchEvents = vi.fn().mockResolvedValue(eventPage(records(LOADED_ROW_COUNT)));
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');
    errorSpy.mockRestore();

    // Property 1 — bounded first window. React Aria must not complain about
    // the spacer rows or window churn.
    expect(consoleErrors).toEqual([]);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    expect(screen.queryByText(`event ${LOADED_ROW_COUNT - 1}`)).not.toBeInTheDocument();
    // Every loaded row is rendered into the virtual table, so "shown" stays
    // the loaded count instead of the fluctuating mounted window.
    expect(screen.getByText(`${LOADED_ROW_COUNT} entries`)).toBeInTheDocument();
    expect(screen.getByText(`${LOADED_ROW_COUNT} shown`)).toBeInTheDocument();

    // Property 2 — the scrollbar stays honest: no row's height is silently
    // lost or double-counted.
    const mounted = countRenderedRows();

    expect(mounted).toBeGreaterThan(0);
    expect(spacerHeightPx('top') + spacerHeightPx('bottom') + mounted * ROW_HEIGHT_PX).toBe(
      LOADED_ROW_COUNT * ROW_HEIGHT_PX,
    );

    // The spacer cell spans all five columns inside the unchanged semantic markup.
    expect(document.querySelector('[data-network-spacer="top"] td')).toHaveAttribute('colspan', '5');
    expect(document.querySelector('[data-network-scroll] table > tbody')).not.toBeNull();

    // Property 3 — scrolling far down mounts that row and unmounts the top
    // rows without re-querying.
    scrollToOffset(SCROLLED_INDEX * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(screen.getByText(`event ${SCROLLED_INDEX}`)).toBeInTheDocument();
    });

    expect(screen.queryByText('event 0')).not.toBeInTheDocument();
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    // The top spacer carries everything above the window's overscan band.
    expect(spacerHeightPx('top')).toBe((SCROLLED_INDEX - OVERSCAN_ROWS) * ROW_HEIGHT_PX);
    expect(searchEvents).toHaveBeenCalledTimes(1);
  });

  it('fetches the next cursor page once the virtual range reaches the last loaded row', async () => {
    // Re-specified 2026-09-21: load-more fires when the range lands on the
    // last loaded row. The offset puts the range end exactly on index 19 of
    // 20 — a `>` boundary instead of `>=` would leave the rail silent here.
    const searchEvents = vi
      .fn()
      .mockImplementation((query: RuntimeEventQuery) =>
        Promise.resolve(
          query.cursor === 'cursor-1' ? eventPage(records(10, 100)) : eventPage(records(20), { nextCursor: 'cursor-1' }),
        ),
      );
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    scrollToOffset(19 * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(searchEvents).toHaveBeenCalledTimes(2);
    });

    expect(searchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);

    // The appended page is real rows: scrolling onto it mounts its last row.
    scrollToOffset(29 * ROW_HEIGHT_PX);

    await screen.findByText('event 109');
  });

  it('a live pushed event keeps the reading position and the selection while the store prepends', async () => {
    // Re-specified 2026-09-21: the old grow-only window answered a head
    // insertion by growing the visible count and pinning scrollTop; now the
    // scroll offset is compensated by the prepended height instead, so the
    // content moves WITH the offset (that is what "the scroll must not jump"
    // means here) and the reading set stays mounted — the pushed row is not
    // in the window until the user returns to the top.
    const { source, push } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage(records(30), { nextCursor: 'cursor-1' })),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    const geometry = scrollToOffset(800);

    screen.getByText('event 22').closest('tr')?.click();
    await waitFor(() => {
      expect(getNetworkStoreState().selectedId).toBe('event-22');
    });

    const before = renderedMessages();

    act(() => {
      push({ timestamp: new Date(200_000).toISOString(), domain: 'api', level: 'info', message: 'pushed while reading' });
    });

    // jsdom fires no scroll event for the programmatic offset compensation, so
    // the event is fired by hand — a real engine dispatches it itself.
    fireEvent.scroll(scroller());

    expect(geometry.scrollTop).toBe(800 + ROW_HEIGHT_PX);
    expect(renderedMessages()).toEqual(before);
    expect(getNetworkStoreState().selectedId).toBe('event-22');
    expect(getNetworkStoreState().domainFilter).toBe('all');
    expect(getNetworkStoreState().nextCursor).toBe('cursor-1');

    // The pushed row was not lost: back at the top it is the newest row mounted.
    scrollToOffset(0);

    expect(screen.getByText('pushed while reading')).toBeInTheDocument();
  });

  it('a scrolled rail keeps the selection the user made after its row unmounts, and a cursorless page is never re-requested', async () => {
    // One harness (a 30-row page with no continuation cursor), two
    // properties (consolidated from two tests). First, re-specified
    // 2026-09-21: the old contract extended the window to the selected row so
    // a selection was never unmounted; the approved change is that the
    // selection survives in the STORE while its row may unmount. Then the
    // cursorless page must never trigger another fetch, however many times
    // the user parks on the virtual end.
    const searchEvents = vi.fn().mockResolvedValue(eventPage(records(30)));
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    screen.getByText('event 5').closest('tr')?.click();
    await waitFor(() => {
      expect(getNetworkStoreState().selectedId).toBe('event-5');
    });

    scrollToOffset(29 * ROW_HEIGHT_PX);

    // Scoped to the rail ON PURPOSE: the open detail inspector legitimately
    // still shows the selected event's message — only the TABLE row unmounts.
    await waitFor(() => {
      expect(within(scroller()).queryByText('event 5')).not.toBeInTheDocument();
    });

    expect(getNetworkStoreState().selectedId).toBe('event-5');

    // A page without a cursor is exhausted: parking on the virtual end twice
    // must not re-query it.
    await settleAsyncPasses();
    scrollToOffset(29 * ROW_HEIGHT_PX);
    await settleAsyncPasses();

    expect(searchEvents).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
  });

  it('fetches exactly one page on mount and never pages on its own, however many pages the backend offers', async () => {
    const searchEvents = vi
      .fn()
      .mockImplementation(() => Promise.resolve(eventPage(records(20), { nextCursor: 'cursor-1' })));
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    await settleAsyncPasses();

    expect(searchEvents).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
  });
});
