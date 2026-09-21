import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureDetail, CaptureQueryFilters, CaptureRow } from '../../../../../shared/contracts/capture.types';
import {
  getTransactionStoreState,
  resetTransactionStore,
} from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { triggerIntersectionObservers } from '../../../../../test/setup';
import { TransactionPanel } from '../TransactionPanel';

/**
 * The Transactions rail is virtualized (@tanstack/react-virtual): only the
 * rows in view mount, spacer rows carry the unrendered height, and load-more
 * fires when the virtual range reaches the last loaded row. jsdom's 0x0 rect
 * falls back to a deterministic 1024x600 viewport — tighter than any real
 * engine, so every ceiling here is honest.
 */

/** Row-height estimate in px; must mirror TRANSACTION_ROW_HEIGHT_ESTIMATE_PX, as a literal on purpose. */
const ROW_HEIGHT_PX = 36;

/** Overscan rows the production virtualizer runs with; must mirror TRANSACTION_VIRTUAL_OVERSCAN_ROWS. */
const OVERSCAN_ROWS = 5;

/** Hard ceiling the virtual window must stay under however many rows are loaded. */
const MOUNTED_ROW_CEILING = 100;

/** A load many times the mounted ceiling, so "bounded" cannot pass by accident. */
const LOADED_ROW_COUNT = 400;

/** Far-down row index the scroll test must reveal; stays inside the loaded fixture. */
const SCROLLED_INDEX = 350;

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

/** Builds `count` newest-first rows with distinct ids and routes, as one backend page. */
function rows(count: number, offset = 0): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({
      requestId: `req-${offset + index}`,
      route: `/api/animes/anime-${offset + index}`,
      capturedAtMs: 100_000 - offset - index,
    }),
  );
}

/** Builds one capture-detail envelope for the selection round trip. */
function detail(): CaptureDetail {
  return { ...row(), payload: {}, correlations: { operationRefs: [] }, deviceId: 'device-1', deviceName: 'Phone' };
}

/** Builds one page envelope, defaulting to a healthy read. */
function capturePage(items: readonly CaptureRow[], nextCursor?: string) {
  return { items, nextCursor, appliedLimit: 25, malformedRowsSkipped: 0, warningCount: 0, degraded: false };
}

/** Builds a fake transaction source, overridable per test. */
function createFakeSource(overrides: Partial<CaptureTransactionSource> = {}): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue(capturePage([])),
    getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail(), degraded: false }),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
    ...overrides,
  };
}

/** Builds a fake capture runtime source whose live listener the test can drive directly. */
function createPushableRuntimeSource() {
  const listeners: ((pushed: CaptureRow) => void)[] = [];

  return {
    runtimeSource: {
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (pushed: CaptureRow) => void) => {
        listeners.push(listener);

        return () => undefined;
      }),
    } satisfies CaptureRuntimeSource,
    push(pushed: CaptureRow) {
      for (const listener of listeners) {
        listener(pushed);
      }
    },
  };
}

/** Builds a source whose every page reports another one after it, so an unattended trigger pages forever. */
function createEndlessSource() {
  let pagesServed = 0;
  const listTransactions = vi.fn().mockImplementation(() => {
    pagesServed += 1;

    return Promise.resolve(capturePage(rows(25, pagesServed * 25), `cursor-${pagesServed}`));
  });

  return { source: createFakeSource({ listTransactions }), listTransactions };
}

/** Flushes several microtask passes, so an unattended fetch loop has room to compound. */
async function settleAsyncPasses(passes = 5): Promise<void> {
  // Sequential by design: each pass lets the previous fetch's continuation run.
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Counts the transaction rows actually mounted, excluding the header and the spacer rows. */
function countRenderedRows(): number {
  return document.querySelectorAll('[data-transaction-scroll] tbody tr:not([data-transaction-spacer])').length;
}

/** Reads the route cell of every mounted row, in render order. */
function renderedRoutes(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-transaction-scroll] tbody tr td:nth-child(3)'),
  ).map((cell) => cell.textContent ?? '');
}

/** Returns the rail's scroll container, failing loudly when the panel did not render one. */
function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-transaction-scroll]');

  if (node === null) {
    throw new Error('the Transactions rail rendered no scroll container');
  }

  return node;
}

/** Reads a spacer row's rendered height in px, failing loudly when the spacer did not render. */
function spacerHeightPx(position: 'bottom' | 'top'): number {
  const spacer = document.querySelector<HTMLElement>(`[data-transaction-spacer="${position}"]`);

  if (spacer === null) {
    throw new Error(`the Transactions rail rendered no "${position}" spacer row`);
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


describe('TransactionPanel virtual window (live rail)', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('mounts a bounded virtual window on the first render, never the whole loaded page', async () => {
    // Re-specified 2026-08-24: the rail used to mount a 25-row batch and grow
    // it; now the assertion is a ceiling over a load many times that ceiling.
    const consoleErrors: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(LOADED_ROW_COUNT))),
    });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');
    errorSpy.mockRestore();

    // React Aria must not complain about the spacer rows or window churn.
    expect(consoleErrors).toEqual([]);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
    expect(screen.queryByText(`/api/animes/anime-${LOADED_ROW_COUNT - 1}`)).not.toBeInTheDocument();
  });

  it('keeps the scrollbar honest: the spacers plus the mounted window account for every loaded row', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(LOADED_ROW_COUNT))),
    });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    // No row's height may be silently lost or double-counted.
    const mounted = countRenderedRows();

    expect(mounted).toBeGreaterThan(0);
    expect(spacerHeightPx('top') + spacerHeightPx('bottom') + mounted * ROW_HEIGHT_PX).toBe(
      LOADED_ROW_COUNT * ROW_HEIGHT_PX,
    );

    // The spacer cell spans all six columns inside the unchanged semantic markup.
    expect(document.querySelector('[data-transaction-spacer="top"] td')).toHaveAttribute('colspan', '6');
    expect(document.querySelector('[data-transaction-scroll] table > tbody')).not.toBeNull();
  });

  it('scrolling far down mounts that row and unmounts the top rows without re-querying', async () => {
    // Re-specified 2026-08-24: the old grow-only window revealed the next
    // batch "without unmounting anything"; the approved contract is the
    // opposite — the window moves and top rows leave the DOM.
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(LOADED_ROW_COUNT)));
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

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

    await screen.findByText('/api/animes/anime-0');

    for (let step = 1; step <= 5; step += 1) {
      scrollToOffset(step * 50 * ROW_HEIGHT_PX);
    }

    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);

    // A keystroke lands as a store filter change; the re-render it causes
    // must not scale with the loaded rows.
    act(() => {
      getTransactionStoreState().setFilters({ route: '/api/sync' });
    });

    await screen.findByText('/api/animes/anime-9000');

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
    // means here) and the reading set stays mounted.
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30), 'cursor-1')),
    });
    const { runtimeSource, push } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    await screen.findByText('/api/animes/anime-0');

    const geometry = scrollToOffset(800);

    screen.getByText('/api/animes/anime-22').closest('tr')?.click();
    await waitFor(() => {
      expect(getTransactionStoreState().selectedId).toBe('req-22');
    });

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

  it('a scrolled rail keeps the selection the user made, even after the selected row leaves the mounted window', async () => {
    // Re-specified 2026-08-24: the old contract extended the window to the
    // selected row so a selection was never unmounted; the approved change is
    // that the selection survives in the STORE while its row may unmount.
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30))),
    });
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
  });

  it('a terminal capture delta updating a row in place leaves the window and selection untouched', async () => {
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

  it('stops offering more once the backend returned a page carrying no continuation cursor', async () => {
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(30)));
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    scrollToOffset(29 * ROW_HEIGHT_PX);
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

  it('fetches exactly one page on mount and never pages on its own, however many pages the backend offers', async () => {
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBeLessThanOrEqual(MOUNTED_ROW_CEILING);
  });

  it('does not fetch when a load-more sentinel reports itself visible, because the rail mounts none', async () => {
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

    act(() => {
      triggerIntersectionObservers(true);
    });

    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);
  });

  it('fetches the next page on a scroll to the virtual end, so the guards above cannot be met by breaking pagination', async () => {
    // Re-specified 2026-08-24: the trigger used to be a near-bottom scroll
    // handler; now it is the virtual range reaching the last loaded row.
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

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
