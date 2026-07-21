import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { useSyncStatusChip } from '../use-sync-status-chip';

function createFakeSource(overrides: Partial<BridgeRuntimeSource> = {}): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn().mockResolvedValue('ok'),
    getEffectiveAddress: vi.fn().mockResolvedValue(''),
    getPairingToken: vi.fn().mockResolvedValue(''),
    getSyncingAnimeItems: vi.fn().mockResolvedValue([]),
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    getAnimeHistory: vi.fn().mockResolvedValue([]),
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

describe('useSyncStatusChip', () => {
  it('derives status from the same source used by the bridge status card, with no new Wails call', async () => {
    const source = createFakeSource();

    const { result } = renderHook(() => useSyncStatusChip(source));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(source.getSQLiteStatus).toHaveBeenCalledTimes(1);
    expect(result.current.linkTo).toBe('/devices');
  });

  it('reports loading before the status resolves', async () => {
    let resolvePromise: ((value: string) => void) | undefined;
    const source = createFakeSource({
      getSQLiteStatus: vi.fn().mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolvePromise = resolve;
        }),
      ),
    });

    const { result } = renderHook(() => useSyncStatusChip(source));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise?.('ok');
    });

    expect(result.current.isLoading).toBe(false);
  });
});
