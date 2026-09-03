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

/** Counts the transaction rows actually mounted, excluding the header. */
function countRenderedRows(): number {
  return document.querySelectorAll('[data-transaction-scroll] [role="rowheader"]').length;
}

/** Reads the route cell of every mounted row, in render order. */
function renderedRoutes(): readonly string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-transaction-scroll] tbody tr td:nth-child(3)')).map(
    (cell) => cell.textContent ?? '',
  );
}

/** Returns the rail's scroll container, failing loudly when the panel did not render one. */
function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-transaction-scroll]');

  if (node === null) {
    throw new Error('the Transactions rail rendered no scroll container');
  }

  return node;
}

/**
 * Builds a source whose every page reports another one after it, so an
 * unattended load-more trigger pages until the test times out instead of
 * stopping at a fixture's last page. Every existing fake returns a page WITHOUT
 * a cursor, which is exactly why they never exercised paging at all.
 */
function createEndlessSource() {
  let pagesServed = 0;
  const listTransactions = vi.fn().mockImplementation(() => {
    pagesServed += 1;

    return Promise.resolve(capturePage(rows(25, pagesServed * 25), `cursor-${pagesServed}`));
  });

  return { source: createFakeSource({ listTransactions }), listTransactions };
}

/** Flushes several microtask passes, so a self-feeding fetch loop has room to compound before the assertion. */
async function settleAsyncPasses(passes = 5): Promise<void> {
  // Sequential by design: each pass lets the previous fetch's continuation run.
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Installs mocked geometry so jsdom (which has no layout) can observe viewport movement. */
function mockScrollTop(node: HTMLElement, scrollTop: number) {
  const state = { scrollTop };
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });

  return state;
}

describe('TransactionPanel progressive list (live rail)', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('renders exactly one batch on the first render, never the whole loaded page', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(60), 'cursor-1')),
    });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    // 25 is TRANSACTION_PAGE_INITIAL_COUNT, written as a literal on purpose:
    // asserting against the production constant would pass no matter what it
    // was changed to.
    expect(countRenderedRows()).toBe(25);
  });

  it('reveals the next batch of loaded rows on scroll without unmounting anything or re-querying', async () => {
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(60), 'cursor-1'));
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    const before = renderedRoutes();

    fireEvent.scroll(scroller());

    await waitFor(() => {
      expect(countRenderedRows()).toBe(50);
    });

    expect(renderedRoutes().slice(0, before.length)).toEqual(before);
    expect(listTransactions).toHaveBeenCalledTimes(1);
  });

  it('appends the next cursor page below the existing rows once the window consumes the loaded ones', async () => {
    const listTransactions = vi
      .fn()
      .mockImplementation((filters: CaptureQueryFilters) =>
        Promise.resolve(filters.cursor === 'cursor-1' ? capturePage(rows(10, 100)) : capturePage(rows(60), 'cursor-1')),
      );
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    const before = renderedRoutes();

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(50);
    });

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(70);
    });

    expect(renderedRoutes().slice(0, before.length)).toEqual(before);
    expect(renderedRoutes()[69]).toBe('/api/animes/anime-109');
    expect(listTransactions).toHaveBeenCalledTimes(2);
    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
  });

  it('a pushed capture grows the window by exactly one and disturbs nothing the user was reading', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(30), 'cursor-1')),
    });
    const { runtimeSource, push } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    await screen.findByText('/api/animes/anime-0');

    const geometry = mockScrollTop(scroller(), 800);

    screen.getByText('/api/animes/anime-5').closest('tr')?.click();
    await waitFor(() => {
      expect(getTransactionStoreState().selectedId).toBe('req-5');
    });

    const before = renderedRoutes();

    act(() => {
      push(row({ requestId: 'req-live', route: '/api/animes/anime-live', outcome: 'pending', capturedAtMs: 200_000 }));
    });

    await waitFor(() => {
      expect(countRenderedRows()).toBe(26);
    });

    expect(renderedRoutes()).toEqual(['/api/animes/anime-live', ...before]);
    expect(geometry.scrollTop).toBe(800);
    expect(getTransactionStoreState().selectedId).toBe('req-5');
    expect(getTransactionStoreState().filters.route).toBe('');
    expect(getTransactionStoreState().nextCursor).toBe('cursor-1');
  });

  it('a terminal capture delta updating a row in place leaves the window and the selection untouched', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue(capturePage(rows(60), 'cursor-1')),
    });
    const { runtimeSource, push } = createPushableRuntimeSource();

    render(<TransactionPanel runtimeSource={runtimeSource} source={source} />);

    await screen.findByText('/api/animes/anime-0');

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(50);
    });

    screen.getByText('/api/animes/anime-5').closest('tr')?.click();
    await waitFor(() => {
      expect(getTransactionStoreState().selectedId).toBe('req-5');
    });

    act(() => {
      push(row({ requestId: 'req-7', route: '/api/animes/anime-7', outcome: 'rejected', httpStatus: 409, durationMs: 8 }));
    });

    await waitFor(() => {
      expect(screen.getByText('rejected')).toBeInTheDocument();
    });

    expect(countRenderedRows()).toBe(50);
    expect(getTransactionStoreState().selectedId).toBe('req-5');
  });

  it('stops offering more once the backend returned a page carrying no continuation cursor', async () => {
    const listTransactions = vi.fn().mockResolvedValue(capturePage(rows(30)));
    const source = createFakeSource({ listTransactions });

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-0');

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(30);
    });

    fireEvent.scroll(scroller());

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBe(30);
  });
});

describe('TransactionPanel load-more trigger', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  /**
   * Mounts the rail against a source that NEVER runs out of pages, then leaves
   * it alone. The rail walks the whole capture table if anything other than a
   * deliberate user gesture can raise load-more.
   *
   * Honest limit: jsdom implements no layout, so an IntersectionObserver-driven
   * sentinel never reports an intersection here on its own and the original
   * runaway cannot be reproduced end to end. What IS testable is everything
   * this guard actually asserts — that mounting fetches exactly one page, that
   * a sentinel intersection does not fetch another, and that a scroll does.
   * Any effect-, collection-, or sentinel-driven fetch reintroduced later trips
   * one of the three immediately.
   */
  it('fetches exactly one page on mount and never pages on its own, however many pages the backend offers', async () => {
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

    await settleAsyncPasses();

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBe(25);
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

  it('fetches the next page on a scroll near the bottom, so the guards above cannot be met by breaking pagination', async () => {
    const { source, listTransactions } = createEndlessSource();

    render(<TransactionPanel source={source} />);

    await screen.findByText('/api/animes/anime-25');

    fireEvent.scroll(scroller());

    await waitFor(() => {
      expect(listTransactions).toHaveBeenCalledTimes(2);
    });

    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    await screen.findByText('/api/animes/anime-50');
  });
});
