import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import { useBridgeStatusCard } from '../use-bridge-status-card';

function createFakeSource(overrides: Partial<BridgeRuntimeSource> = {}): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn().mockResolvedValue(''),
    getEffectiveAddress: vi.fn().mockResolvedValue(''),
    getPairingToken: vi.fn().mockResolvedValue(''),
    getSyncingAnimeItems: vi.fn().mockResolvedValue([]),
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    getAnimeHistory: vi.fn().mockResolvedValue([]),
    triggerReconcile: vi.fn().mockResolvedValue(''),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useBridgeStatusCard', () => {
  it('loads the sqlite status on mount via the injected source', async () => {
    const source = createFakeSource({ getSQLiteStatus: vi.fn().mockResolvedValue('ok') });

    const { result } = renderHook(() => useBridgeStatusCard(source));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.sqliteStatus).toBe('ok');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.statusTone).toBe('success');
    expect(source.getSQLiteStatus).toHaveBeenCalledTimes(1);
  });

  it('uses the default singleton source when no source is injected', () => {
    const { result } = renderHook(() => useBridgeStatusCard());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.sqliteStatus).toBe('');
  });
});
