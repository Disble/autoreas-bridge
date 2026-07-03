import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import { useSyncingAnimePanel } from '../use-syncing-anime-panel';

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

describe('useSyncingAnimePanel', () => {
  it('loads syncing anime items on mount via the injected source', async () => {
    const source = createFakeSource({
      getSyncingAnimeItems: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-7',
          title: 'Dungeon Meshi',
          changeType: 'update',
          pendingChanges: 2,
          changedFields: ['nrocapvisto'],
          progressCurrent: 18,
          progressTotal: 24,
          lastChangedAtMs: Date.UTC(2026, 5, 20, 18, 15, 0),
          activo: 1,
        },
      ]),
    });

    const { result } = renderHook(() => useSyncingAnimePanel({ refreshToken: 0 }, source));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(result.current.items[0]?.title).toBe('Dungeon Meshi');
    expect(result.current.isLoading).toBe(false);
  });

  it('refetches when the refresh token changes', async () => {
    const source = createFakeSource({
      getSyncingAnimeItems: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            animeId: 'anime-9',
            title: 'Frieren',
            changeType: 'update',
            pendingChanges: 1,
            changedFields: ['estado'],
          progressCurrent: 12,
          lastChangedAtMs: Date.UTC(2026, 5, 20, 18, 30, 0),
          activo: 1,
          },
        ]),
    });

    const { result, rerender } = renderHook(
      ({ refreshToken }) => useSyncingAnimePanel({ refreshToken }, source),
      { initialProps: { refreshToken: 0 } },
    );

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
    });

    rerender({ refreshToken: 1 });

    await waitFor(() => {
      expect(result.current.items[0]?.title).toBe('Frieren');
    });

    expect(source.getSyncingAnimeItems).toHaveBeenCalledTimes(2);
  });

  it('uses the default singleton source when none is injected', async () => {
    const { result } = renderHook(() => useSyncingAnimePanel({ refreshToken: 0 }));

    await waitFor(() => {
      expect(result.current.items).toEqual([]);
    });
  });

  it('recovers to an empty list when the source rejects', async () => {
    const source = createFakeSource({
      getSyncingAnimeItems: vi.fn().mockRejectedValue(new Error('binding unavailable')),
    });

    const { result } = renderHook(() => useSyncingAnimePanel({ refreshToken: 0 }, source));

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
    });

    expect(result.current.items).toEqual([]);
  });
});
