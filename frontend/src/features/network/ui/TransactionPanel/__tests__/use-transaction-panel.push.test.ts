import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { getTransactionStoreState, resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
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

/** A fake runtime source whose active listener is tracked, so a push is only delivered while the subscription is open. */
function createCapturingRuntimeSource(): {
  readonly runtimeSource: CaptureRuntimeSource;
  readonly push: (row: CaptureRow) => void;
} {
  /** The listener currently subscribed, or undefined once the hook unsubscribed from it. */
  let listener: ((row: CaptureRow) => void) | undefined;
  const runtimeSource = createFakeRuntimeSource({
    subscribeCaptureTransactions: vi.fn().mockImplementation((next: (row: CaptureRow) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  });
  return { runtimeSource, push: (row: CaptureRow) => listener?.(row) };
}

describe('useTransactionPanel — live capture.transaction push', () => {
  afterEach(() => {
    // Unmounting matters as much as resetting the store: a hook left mounted
    // stays subscribed to the shared zustand store, so the NEXT test's store
    // writes re-run the previous test's effects against its already-exhausted
    // mocks.
    cleanup();
    resetTransactionStore();
  });

  it('subscribes to the capture runtime source and upserts pushed rows live', async () => {
    const source = createFakeSource();
    let pushRow: ((row: CaptureRow) => void) | undefined;
    const runtimeSource = createFakeRuntimeSource({
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (row: CaptureRow) => void) => {
        pushRow = listener;
        return () => undefined;
      }),
    });

    const { result } = renderHook(() => useTransactionPanel(source, undefined, runtimeSource));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(runtimeSource.subscribeCaptureTransactions).toHaveBeenCalledTimes(1);

    act(() => {
      pushRow?.(row({ requestId: 'req-live', outcome: 'pending' }));
    });

    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toContain('req-live'));
  });

  it('admits a pushed row matching the active filters and rejects one that does not match', async () => {
    const source = createFakeSource();
    let pushRow: ((row: CaptureRow) => void) | undefined;
    const runtimeSource = createFakeRuntimeSource({
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (row: CaptureRow) => void) => {
        pushRow = listener;
        return () => undefined;
      }),
    });

    const { result } = renderHook(() => useTransactionPanel(source, undefined, runtimeSource));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onRouteChange('animes');
    });
    await waitFor(() => expect(source.listTransactions).toHaveBeenCalledTimes(2));

    act(() => {
      pushRow?.(row({ requestId: 'req-matching', route: '/api/animes/anime-1' }));
    });

    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toContain('req-matching'));

    act(() => {
      pushRow?.(row({ requestId: 'req-other', route: '/ws' }));
    });

    expect(result.current.rows.map((item) => item.id)).not.toContain('req-other');
  });

  it('preserves the current selection when a pushed row upserts into the buffer', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row({ requestId: 'req-1' })],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
      getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail({ requestId: 'req-1' }), degraded: false }),
    });
    let pushRow: ((row: CaptureRow) => void) | undefined;
    const runtimeSource = createFakeRuntimeSource({
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (row: CaptureRow) => void) => {
        pushRow = listener;
        return () => undefined;
      }),
    });

    const { result } = renderHook(() => useTransactionPanel(source, undefined, runtimeSource));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => {
      result.current.onSelect('req-1');
    });

    await waitFor(() => expect(result.current.selectedId).toBe('req-1'));

    act(() => {
      pushRow?.(row({ requestId: 'req-2', outcome: 'pending' }));
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(getTransactionStoreState().selectedId).toBe('req-1');
  });

  it('re-attaches the live subscription when the capture runtime source changes, so pushes follow the new source', async () => {
    /** Shared across both mounts, so the runtime source is the only thing that differs between them. */
    const source = createFakeSource();
    const first = createCapturingRuntimeSource();
    const second = createCapturingRuntimeSource();

    const { result, rerender } = renderHook(
      ({ runtime }: { readonly runtime: CaptureRuntimeSource }) => useTransactionPanel(source, undefined, runtime),
      { initialProps: { runtime: first.runtimeSource } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(first.runtimeSource.subscribeCaptureTransactions).toHaveBeenCalledTimes(1);
    expect(second.runtimeSource.subscribeCaptureTransactions).not.toHaveBeenCalled();

    rerender({ runtime: second.runtimeSource });

    await waitFor(() => expect(second.runtimeSource.subscribeCaptureTransactions).toHaveBeenCalledTimes(1));

    // The unsubscribe of the first source is the behaviour under test: once it
    // ran, a push delivered through the old source's listener must be a no-op.
    act(() => {
      first.push(row({ requestId: 'req-old-source' }));
    });
    act(() => {
      second.push(row({ requestId: 'req-new-source' }));
    });

    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toContain('req-new-source'));
    expect(result.current.rows.map((item) => item.id)).not.toContain('req-old-source');
  });

  /** One live-push scenario for the selected-row detail refresh gate. */
  interface DetailRefreshScenario {
    readonly name: string;
    /** Overrides for the single row pushed through the runtime listener. */
    readonly push: Partial<CaptureRow>;
    /** Route filter applied before the push, when the row must be rejected by the admission gate. */
    readonly routeFilter?: string;
    readonly expectedOutcome: string;
    readonly expectedGetTransactionCalls: number;
  }

  /** Rows pinning the refresh gate from both sides: who may re-fetch, and who may not. */
  const detailRefreshScenarios: readonly DetailRefreshScenario[] = [
    {
      name: 'refreshes the selected detail when the selected request transitions from pending to terminal via a runtime upsert',
      push: { outcome: 'accepted' },
      expectedOutcome: 'accepted',
      expectedGetTransactionCalls: 2,
    },
    {
      name: 'keeps the selected detail untouched while a push for the selected request is still pending',
      push: { outcome: 'pending' },
      expectedOutcome: 'pending',
      expectedGetTransactionCalls: 1,
    },
    {
      name: 'keeps the selected detail untouched when a terminal push arrives for a different request',
      push: { requestId: 'req-2', outcome: 'accepted' },
      expectedOutcome: 'pending',
      expectedGetTransactionCalls: 1,
    },
    {
      name: 'still refreshes the selected detail when the active filters reject the pushed row',
      push: { outcome: 'accepted' },
      routeFilter: 'zzz',
      expectedOutcome: 'accepted',
      expectedGetTransactionCalls: 2,
    },
  ];

  it.each(detailRefreshScenarios)('$name', async (scenario) => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row({ requestId: 'req-1', outcome: 'pending', capturedAtMs: Date.now() })],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
      getTransaction: vi
        .fn()
        .mockResolvedValueOnce({ found: true, item: detail({ requestId: 'req-1', outcome: 'pending', capturedAtMs: Date.now() }), degraded: false })
        .mockResolvedValue({ found: true, item: detail({ requestId: 'req-1', outcome: 'accepted', httpStatus: 200, durationMs: 12 }), degraded: false }),
    });
    let pushRow: ((row: CaptureRow) => void) | undefined;
    const runtimeSource = createFakeRuntimeSource({
      subscribeCaptureTransactions: vi.fn().mockImplementation((listener: (row: CaptureRow) => void) => {
        pushRow = listener;
        return () => undefined;
      }),
    });

    const { result } = renderHook(() => useTransactionPanel(source, undefined, runtimeSource));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => {
      result.current.onSelect('req-1');
    });

    await waitFor(() => expect(result.current.selectedDetail?.outcome).toBe('pending'));

    if (scenario.routeFilter !== undefined) {
      /** The narrowed filter value, so the closure keeps the non-undefined type. */
      const routeFilter = scenario.routeFilter;
      act(() => {
        result.current.onRouteChange(routeFilter);
      });
      await waitFor(() => expect(source.listTransactions).toHaveBeenCalledTimes(2));
    }

    act(() => {
      pushRow?.({ ...row(), ...scenario.push });
    });

    await waitFor(() => expect(source.getTransaction).toHaveBeenCalledTimes(scenario.expectedGetTransactionCalls));
    await waitFor(() => expect(result.current.selectedDetail?.outcome).toBe(scenario.expectedOutcome));
  });
});
