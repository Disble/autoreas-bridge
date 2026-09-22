import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureQueryFilters } from '../../../../../shared/contracts/capture.types';
import {
  getTransactionStoreState,
  resetTransactionStore,
} from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { triggerIntersectionObservers } from '../../../../../test/setup';
import {
  countRenderedRows,
  capturePage,
  createEndlessSource,
  createFakeSource,
  createPushableRuntimeSource,
  LOADED_ROW_COUNT,
  MOUNTED_ROW_CEILING,
  OVERSCAN_ROWS,
  renderedRoutes,
  row,
  ROW_HEIGHT_PX,
  rows,
  SCROLLED_INDEX,
  scrollToOffset,
  settleAsyncPasses,
  scroller,
  spacerHeightPx,
} from './transaction-panel.test-helpers';
import { TRANSACTION_FILTER_DEBOUNCE_MS } from '../transaction-panel.constants';
import { TransactionPanel } from '../TransactionPanel';

/**
 * The Transactions rail is virtualized (@tanstack/react-virtual): only the
 * rows in view mount, spacer rows carry the unrendered height, and load-more
 * fires when the virtual range reaches the last loaded row. jsdom's 0x0 rect
 * falls back to a deterministic 1024x600 viewport — tighter than any real
 * engine, so every ceiling here is honest.
 *
 * Consolidated for the mutation gate's per-test budget: tests that shared one
 * harness (one fake source, one render, scrolls) were merged into a single
 * test proving several properties in sequence — except where a merged test's
 * own stimulus sequence would become the tallest pole against that same
 * per-test budget (the live-push and in-place-delta pair keeps one render
 * each). Every assertion, exact value, and re-specification note survives;
 * only redundant renders were removed.
 */

describe('TransactionPanel virtual window (live rail)', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('mounts a bounded virtual window over the whole loaded page, keeps the scrollbar honest, and moves the window on scroll without re-querying', async () => {
    // One harness, three properties (consolidated from three tests sharing
    // the same 150-row load, render, and scrolls). Re-specified 2026-08-24:
    // the rail used to mount a 25-row batch and grow it; the approved
    // contract is the opposite — the first window is a ceiling over a load
    // many times that ceiling, the spacers carry every unrendered height, and
    // scrolling far down moves the window (top rows leave the DOM) instead of
    // growing it "without unmounting anything".
    const consoleErrors: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(LOADED_ROW_COUNT)));
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    // One settled pass and a single DOM query: the 150-row page is a
    // resolved mock, so no polling budget is spent waiting for it.
    await settleAsyncPasses();

    expect(screen.getByText('/api/animes/anime-0')).toBeInTheDocument();
    errorSpy.mockRestore();

    // Property 1 — bounded first window. React Aria must not complain about
    // the spacer rows or window churn.
    expect(consoleErrors).toEqual([]);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    expect(screen.queryByText(`/api/animes/anime-${LOADED_ROW_COUNT - 1}`)).not.toBeInTheDocument();

    // Property 2 — the scrollbar stays honest: no row's height is silently
    // lost or double-counted.
    const mounted = countRenderedRows();

    expect(mounted).toBeGreaterThan(0);
    expect(spacerHeightPx('top') + spacerHeightPx('bottom') + mounted * ROW_HEIGHT_PX).toBe(
      LOADED_ROW_COUNT * ROW_HEIGHT_PX,
    );

    // The spacer cell spans all six columns inside the unchanged semantic markup.
    expect(document.querySelector('[data-transaction-spacer="top"] td')).toHaveAttribute('colspan', '6');
    expect(document.querySelector('[data-transaction-scroll] table > tbody')).not.toBeNull();

    // Property 3 — scrolling far down mounts that row and unmounts the top
    // rows without re-querying.
    scrollToOffset(SCROLLED_INDEX * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(screen.getByText(`/api/animes/anime-${SCROLLED_INDEX}`)).toBeInTheDocument();
    });

    expect(screen.queryByText('/api/animes/anime-0')).not.toBeInTheDocument();
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    // The top spacer carries everything above the window's overscan band.
    expect(spacerHeightPx('top')).toBe((SCROLLED_INDEX - OVERSCAN_ROWS) * ROW_HEIGHT_PX);
    expect(listTransactions).toHaveBeenCalledTimes(1);
  });

  it('fetches the next cursor page once the virtual range reaches the last loaded row', async () => {
    // Re-specified 2026-08-24: load-more fires when the range lands on the
    // last loaded row. The offset puts the range end exactly on index 24 of
    // 25 — a `>` boundary instead of `>=` would leave the rail silent here
    // and every other case still passes.
    const listTransactions = vi
      .fn()
      .mockImplementation((filters: CaptureQueryFilters) =>
        Promise.resolve(filters.cursor === 'cursor-1' ? capturePage(rows(10, 100)) : capturePage(rows(25), 'cursor-1')),
      );
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    scrollToOffset(24 * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(listTransactions).toHaveBeenCalledTimes(2);
    });

    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);

    // The appended page is real rows: scrolling onto it mounts its last row.
    scrollToOffset(34 * ROW_HEIGHT_PX);

    await screen.findByText('/api/animes/anime-109');
  });

  it('typing a filter while hundreds of rows are loaded still mounts only the bounded window', async () => {
    // This is the freeze regression itself: the rail used to accumulate every
    // revealed row, so re-rendering while the user typed remounted the whole
    // history. The scrolls emulate the reading session that accumulated rows
    // under the old grow-only window (each grew it by a batch, past the
    // ceiling); under the virtualized contract they only move the window.
    const listTransactions = vi
      .fn()
      .mockImplementation((filters: CaptureQueryFilters) =>
        Promise.resolve(
          filters.route === '/api/sync' ? capturePage(rows(2, 9_000)) : capturePage(rows(LOADED_ROW_COUNT)),
        ),
      );
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    // One settled pass and a single DOM query: the 150-row page is a
    // resolved mock, so no polling budget is spent waiting for it.
    await settleAsyncPasses();

    expect(screen.getByText('/api/animes/anime-0')).toBeInTheDocument();

    for (let step = 1; step <= 4; step += 1) {
      scrollToOffset(step * 25 * ROW_HEIGHT_PX);
    }

    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);

    // A keystroke lands as a store filter change; the re-render it causes
    // must not scale with the loaded rows. The query itself now waits for the
    // app-wide debounce window, so the settled state is one window plus the
    // async passes — a real (not faked) single wait, then the usual settles.
    act(() => {
      getTransactionStoreState().setFilters({ route: '/api/sync' });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, TRANSACTION_FILTER_DEBOUNCE_MS));
    });
    await settleAsyncPasses(2);

    expect(screen.getByText('/api/animes/anime-9000')).toBeInTheDocument();

    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    expect(listTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ route: '/api/sync', cursor: undefined }),
    );
  });

  it('a live pushed capture keeps the reading position and the selection while the store prepends', async () => {
    // Re-specified 2026-08-24: the old grow-only window answered a head
    // insertion by growing the visible count and pinning scrollTop; now the
    // scroll offset is compensated by the prepended height instead, so the
    // content moves WITH the offset (that is what "the scroll must not jump"
    // means here) and the reading set stays mounted. This test stands alone
    // (not merged into its neighbors) because the gate's per-test budget is
    // what the consolidation serves: its selection round trip plus push
    // stimulus is already the rail's most expensive sequence.
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30), 'cursor-1')),
    });
    const { runtimeSource, push } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    // One settled pass and a single DOM query replace findByText polling:
    // the source is a resolved mock, so the rows are deterministic.
    await settleAsyncPasses();

    expect(screen.getByText('/api/animes/anime-0')).toBeInTheDocument();

    const geometry = scrollToOffset(800);

    screen.getByText('/api/animes/anime-22').closest('tr')?.click();
    await settleAsyncPasses();

    expect(getTransactionStoreState().selectedId).toBe('req-22');

    const before = renderedRoutes();

    act(() => {
      push(row({ requestId: 'req-live', route: '/api/animes/anime-live', outcome: 'pending', capturedAtMs: 200_000 }));
    });

    // jsdom fires no scroll event for the programmatic offset compensation, so
    // the event is fired by hand — a real engine dispatches it itself.
    fireEvent.scroll(scroller());

    expect(geometry.scrollTop).toBe(800 + ROW_HEIGHT_PX);
    expect(renderedRoutes()).toEqual(before);
    expect(getTransactionStoreState().selectedId).toBe('req-22');
    expect(getTransactionStoreState().filters.route).toBe('');
    expect(getTransactionStoreState().nextCursor).toBe('cursor-1');

    // The pushed row was not lost: back at the top it is the newest row mounted.
    scrollToOffset(0);

    expect(screen.getByText('/api/animes/anime-live')).toBeInTheDocument();
  });

  it('a terminal capture delta updating a row in place leaves the window and selection untouched', async () => {
    // Harness shared with the live-push test above (a 30-row page with a
    // continuation cursor plus a pushable runtime source); kept as its own
    // test for the per-test budget. An in-place delta proves the opposite
    // kind of push to the head insertion: it is not a prepend, so neither
    // the offset nor the selection moves.
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30), 'cursor-1')),
    });
    const { runtimeSource, push } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    await screen.findByText('/api/animes/anime-0');

    // req-3 and req-5 both sit inside the at-rest window, so no scroll is
    // needed: the delta updates the row in place.
    screen.getByText('/api/animes/anime-3').closest('tr')?.click();
    await waitFor(() => {
      expect(getTransactionStoreState().selectedId).toBe('req-3');
    });

    act(() => {
      push(row({ requestId: 'req-5', route: '/api/animes/anime-5', outcome: 'rejected', httpStatus: 409, durationMs: 8 }));
    });

    await waitFor(() => {
      expect(screen.getByText('rejected')).toBeInTheDocument();
    });

    // An in-place update is not a head insertion, so the offset is not compensated.
    expect(scroller().scrollTop).toBe(0);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    expect(getTransactionStoreState().selectedId).toBe('req-3');
  });

  it('a scrolled rail keeps the selection the user made after its row unmounts, and a cursorless page is never re-requested', async () => {
    // One harness (a 30-row page with no continuation cursor), two
    // properties (consolidated from two tests). First, re-specified
    // 2026-08-24: the old contract extended the window to the selected row so
    // a selection was never unmounted; the approved change is that the
    // selection survives in the STORE while its row may unmount. Then the
    // cursorless page must never trigger another fetch, however many times
    // the user parks on the virtual end.
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(30)));
    const source = createFakeSource({ listTransactions });
    const { runtimeSource } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    await screen.findByText('/api/animes/anime-0');

    screen.getByText('/api/animes/anime-5').closest('tr')?.click();
    await waitFor(() => {
      expect(getTransactionStoreState().selectedId).toBe('req-5');
    });

    scrollToOffset(29 * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(screen.queryByText('/api/animes/anime-5')).not.toBeInTheDocument();
    });

    expect(getTransactionStoreState().selectedId).toBe('req-5');

    // A page without a cursor is exhausted: parking on the virtual end twice
    // must not re-query it.
    await settleAsyncPasses();
    scrollToOffset(29 * ROW_HEIGHT_PX);
    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
  });
});

describe('TransactionPanel load-more trigger', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('fetches exactly one page on mount, never pages on its own — not even when a sentinel reports itself visible — and fetches the next page only on a scroll to the virtual end', async () => {
    // One harness (the endless source), three properties (consolidated from
    // three tests): mount fetches exactly once and the unattended loop stays
    // silent; a visible load-more sentinel fetches nothing because the rail
    // mounts none; and the ONLY trigger is the virtual range reaching the
    // last loaded row — re-specified 2026-08-24 from the old near-bottom
    // scroll handler.
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);

    act(() => {
      triggerIntersectionObservers(true);
    });

    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);

    scrollToOffset(24 * ROW_HEIGHT_PX);

    await waitFor(() => {
      expect(listTransactions).toHaveBeenCalledTimes(2);
    });

    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));

    // Re-specified 2026-08-24: the old grow-only window kept every fetched row
    // mounted, so the next page's first row was asserted directly; the virtual
    // window proves the new page landed by mounting the row now at the offset
    // (page 3's rows enter at index 50).
    scrollToOffset(49 * ROW_HEIGHT_PX);

    await screen.findByText('/api/animes/anime-75');
    expect(listTransactions).toHaveBeenCalledTimes(3);
  });
});
