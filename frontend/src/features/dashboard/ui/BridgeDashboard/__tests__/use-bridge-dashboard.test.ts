import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import { useBridgeDashboard } from '../use-bridge-dashboard';

function createFakeSource(overrides: Partial<BridgeRuntimeSource> = {}): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn().mockResolvedValue(''),
    getEffectiveAddress: vi.fn().mockResolvedValue(''),
    getPairingToken: vi.fn().mockResolvedValue(''),
    getSyncingAnimeItems: vi.fn().mockResolvedValue([]),
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    pullAnimesFromLegacy: vi.fn().mockResolvedValue({
      message: '',
      prunedCount: 0,
      status: 'ok',
      updatedCount: 0,
      warningCount: 0,
    }),
    triggerReconcile: vi.fn().mockResolvedValue(''),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useBridgeDashboard', () => {
  it('starts idle', () => {
    const source = createFakeSource();
    const { result } = renderHook(() => useBridgeDashboard(source));

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('');
    expect(result.current.syncingAnimeRefreshToken).toBe(0);
  });

  it('reconciles via the injected source and stores the returned result', async () => {
    let resolvePromise: ((value: string) => void) | undefined;
    const source = createFakeSource({
      triggerReconcile: vi.fn().mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolvePromise = resolve;
        }),
      ),
    });

    const { result } = renderHook(() => useBridgeDashboard(source));

    let syncPromise: Promise<void> | undefined;

    act(() => {
      syncPromise = result.current.onTriggerSync();
    });

    expect(result.current.isSyncing).toBe(true);

    await act(async () => {
      resolvePromise?.('done');
      await syncPromise;
    });

    expect(source.triggerReconcile).toHaveBeenCalledTimes(1);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('done');
    expect(result.current.syncingAnimeRefreshToken).toBe(1);
  });

  it('uses the default singleton source when no source is injected', () => {
    const { result } = renderHook(() => useBridgeDashboard());

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('');
    expect(result.current.syncingAnimeRefreshToken).toBe(0);
  });
});
