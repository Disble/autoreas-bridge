import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { getTransactionStoreState, resetTransactionStore } from '../../../../../shared/store/transaction-store';
import { useTransactionPanel } from '../use-transaction-panel';

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
    ...overrides,
  };
}

function createFakeRuntimeSource(overrides: Partial<CaptureRuntimeSource> = {}): CaptureRuntimeSource {
  return {
    subscribeCaptureTransactions: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useTransactionPanel', () => {
  afterEach(() => {
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

  it('refreshes the selected detail when the selected request transitions from pending to terminal via a runtime upsert', async () => {
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
        .mockResolvedValueOnce({ found: true, item: detail({ requestId: 'req-1', outcome: 'accepted', httpStatus: 200, durationMs: 12 }), degraded: false }),
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

    act(() => {
      pushRow?.(row({ requestId: 'req-1', outcome: 'accepted', httpStatus: 200, durationMs: 12 }));
    });

    await waitFor(() => expect(result.current.selectedDetail?.outcome).toBe('accepted'));
    expect(source.getTransaction).toHaveBeenCalledTimes(2);
  });
});
