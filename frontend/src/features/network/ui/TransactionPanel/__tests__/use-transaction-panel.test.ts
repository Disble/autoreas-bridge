import { act, cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { ELAPSED_CLOCK_TICK_MS } from '../../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock.constants';
import {
  getTransactionStoreState,
  resetTransactionStore,
} from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { useTransactionPanel } from '../use-transaction-panel';

/** Builds one capture row, overridable field by field per test. */
function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids, as one backend page. */
function pageRows(count: number, offset: number): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({ requestId: `req-${offset + index}`, capturedAtMs: 100_000 - offset - index }),
  );
}

/** Builds one capture-detail envelope on top of the base row. */
function detail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    ...row(),
    payload: {},
    correlations: { operationRefs: [] },
    deviceId: 'device-1',
    deviceName: 'Phone',
    ...overrides,
  };
}

/** Builds a fake transaction source resolving an empty page, overridable per test. */
function createFakeSource(overrides: Partial<CaptureTransactionSource> = {}): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    }),
    getTransaction: vi.fn().mockResolvedValue({ found: false, item: detail(), degraded: false }),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
    ...overrides,
  };
}

/** Builds a fake capture runtime source with a no-op subscription, overridable per test. */
function createFakeRuntimeSource(overrides: Partial<CaptureRuntimeSource> = {}): CaptureRuntimeSource {
  return {
    subscribeCaptureTransactions: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

/** Row-height estimate the virtual window runs on, in px; must mirror TRANSACTION_ROW_HEIGHT_ESTIMATE_PX. */
const ROW_HEIGHT_PX = 36;

/**
 * Attaches a detached scroll container to the hook's scrollRef so the virtual
 * window has an element to observe. Mirrors the helper in
 * `use-transaction-panel-window.test.ts` — a shared support file is outside
 * this task's allowed surfaces.
 */
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

describe('useTransactionPanel', () => {
  afterEach(() => {
    // Unmounting matters as much as resetting the store: a hook left mounted
    // stays subscribed to the shared zustand store, so the NEXT test's store
    // writes re-run the previous test's effects against its already-exhausted
    // mocks.
    cleanup();
    resetTransactionStore();
  });

  it('loads the first page on mount', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row({ requestId: 'req-1' })],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
    });

    const { result } = renderHook(() => useTransactionPanel(source));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
    expect(source.listTransactions).toHaveBeenCalledTimes(1);
  });

  it('reloads with a "replace" page when a filter changes', async () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useTransactionPanel(source));

    await waitFor(() => expect(source.listTransactions).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onRouteChange('/api/animes/anime-2');
    });

    await waitFor(() => expect(source.listTransactions).toHaveBeenCalledTimes(2));
    expect(source.listTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ route: '/api/animes/anime-2', cursor: undefined }),
    );
  });

  it('loads the transaction detail when a row is selected', async () => {
    const source = createFakeSource({
      getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail({ requestId: 'req-1' }), degraded: false }),
    });
    const { result } = renderHook(() => useTransactionPanel(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onSelect('req-1');
    });

    await waitFor(() => expect(result.current.selectedDetail).not.toBeNull());
    expect(source.getTransaction).toHaveBeenCalledWith('req-1');
  });

  it('resets the detail tab to "general" whenever the selection changes', async () => {
    const source = createFakeSource({
      getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail({ requestId: 'req-1' }), degraded: false }),
    });
    const { result } = renderHook(() => useTransactionPanel(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onDetailTabChange('response');
    });
    expect(result.current.detailTab).toBe('response');

    act(() => {
      result.current.onSelect('req-1');
    });

    expect(result.current.detailTab).toBe('general');
  });

  it('surfaces degraded=true when the source reports a degraded page', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: true,
      }),
    });
    const { result } = renderHook(() => useTransactionPanel(source));

    await waitFor(() => expect(result.current.degraded).toBe(true));
  });

  it('appends the next cursor page below the loaded rows, preserving selection and filters', async () => {
    const listTransactions = vi.fn().mockImplementation((filters: { cursor?: string }) =>
      Promise.resolve({
        items: filters.cursor === 'cursor-1' ? pageRows(25, 25) : pageRows(25, 0),
        nextCursor: filters.cursor === 'cursor-1' ? undefined : 'cursor-1',
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
    );
    const source = createFakeSource({ listTransactions });
    const { result } = renderHook(() => useTransactionPanel(source));

    // The virtual window mounts 22 of the 25 loaded rows (600 px at 36 px plus
    // overscan), so the load is asserted on the store rather than on `rows`.
    await waitFor(() => expect(getTransactionStoreState().items).toHaveLength(25));

    act(() => {
      result.current.onSelect('req-3');
    });
    act(() => {
      result.current.onRouteChange('/api/animes/anime-1');
    });
    await waitFor(() => expect(listTransactions).toHaveBeenCalledTimes(2));

    // Re-specified 2026-08-24: load-more used to be a near-bottom scroll
    // handler; now it fires when the virtual range reaches the last loaded
    // row, so the scroller is moved onto the last loaded row's offset. The
    // virtual window no longer mirrors the loaded set, so the append itself is
    // asserted on the store and the window's head after scrolling back to top.
    const scroller = attachScroller(result);

    scrollTo(scroller, 24 * ROW_HEIGHT_PX);

    await waitFor(() => expect(getTransactionStoreState().items).toHaveLength(50));
    expect(getTransactionStoreState().items[49]?.requestId).toBe('req-49');

    scrollTo(scroller, 0);

    expect(result.current.rows[0]?.id).toBe('req-0');
    expect(result.current.selectedId).toBe('req-3');
    expect(result.current.route).toBe('/api/animes/anime-1');
    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
  });

  it('stops requesting pages once the backend returned one carrying no cursor', async () => {
    const listTransactions = vi.fn().mockResolvedValue({
      items: pageRows(25, 0),
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    });
    const source = createFakeSource({ listTransactions });
    const { result } = renderHook(() => useTransactionPanel(source));

    // The virtual window mounts 22 of the 25 loaded rows (600 px at 36 px plus
    // overscan), so the load is asserted on the store rather than on `rows`.
    await waitFor(() => expect(getTransactionStoreState().items).toHaveLength(25));

    const scroller = attachScroller(result);

    scrollTo(scroller, 24 * ROW_HEIGHT_PX);
    scrollTo(scroller, 24 * ROW_HEIGHT_PX);

    expect(listTransactions).toHaveBeenCalledTimes(1);
  });

  it('restarts pagination from page one when a filter changes, dropping the previous query rows', async () => {
    const listTransactions = vi.fn().mockImplementation((filters: { cursor?: string; kind?: string }) => {
      if (filters.kind === 'post') {
        return Promise.resolve({
          items: pageRows(2, 900),
          appliedLimit: 25,
          malformedRowsSkipped: 0,
          warningCount: 0,
          degraded: false,
        });
      }

      return Promise.resolve({
        items: filters.cursor === 'cursor-1' ? pageRows(25, 25) : pageRows(25, 0),
        nextCursor: filters.cursor === 'cursor-1' ? undefined : 'cursor-1',
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      });
    });
    const source = createFakeSource({ listTransactions });
    const { result } = renderHook(() => useTransactionPanel(source));

    // The virtual window mounts 22 of the 25 loaded rows (600 px at 36 px plus
    // overscan), so the load is asserted on the store rather than on `rows`.
    await waitFor(() => expect(getTransactionStoreState().items).toHaveLength(25));

    const scroller = attachScroller(result);

    scrollTo(scroller, 24 * ROW_HEIGHT_PX);
    await waitFor(() => expect(getTransactionStoreState().items).toHaveLength(50));

    act(() => {
      result.current.onKindChange('post');
    });

    // Both replacement rows fit inside the virtual window, so `rows` mirrors
    // the load again here.
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map((item) => item.id)).toEqual(['req-900', 'req-901']);
    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined, kind: 'post' }));
  });
});

describe('useTransactionPanel — the visible rows carry no clock', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
    vi.useRealTimers();
  });

  it('keeps the mapped rows identical across elapsed-clock ticks while a row is still in flight', async () => {
    vi.useFakeTimers();

    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row({ requestId: 'req-live', outcome: 'pending', capturedAtMs: Date.now() }), row({ requestId: 'req-1' })],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
    });
    const { result } = renderHook(() => useTransactionPanel(source, undefined, createFakeRuntimeSource()));

    await vi.waitFor(() => expect(result.current.rows).toHaveLength(2));
    const rowsBeforeTicks = result.current.rows;

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS * 4);
    });

    expect(result.current.rows).toBe(rowsBeforeTicks);
  });

  it('starts no timer of its own for a pending row: the clock belongs to the row that needs it', async () => {
    vi.useFakeTimers();

    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row({ requestId: 'req-live', outcome: 'pending', capturedAtMs: Date.now() })],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
    });
    const { result } = renderHook(() => useTransactionPanel(source, undefined, createFakeRuntimeSource()));

    await vi.waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(vi.getTimerCount()).toBe(0);
  });
});
