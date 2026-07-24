import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store';
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
});
