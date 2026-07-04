import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeHistoryEntry } from '../../../../../shared/contracts/anime.types';
import { HISTORY_TABLE_PAGE_SIZE } from '../history-table.constants';
import { useHistoryTable } from '../use-history-table';

function entry(overrides: Partial<AnimeHistoryEntry>): AnimeHistoryEntry {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    nrocapvisto: 12,
    fechaUltCapVisto: Date.UTC(2026, 5, 30, 12, 12, 0),
    estado: 0,
    ...overrides,
  };
}

function createSource(entries: readonly AnimeHistoryEntry[]): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn(),
    getAnimeHistory: vi.fn().mockResolvedValue(entries),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useHistoryTable', () => {
  it('starts loading with no rows', () => {
    const source = createSource([]);
    const { result } = renderHook(() => useHistoryTable({}, source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
  });

  it('loads via a single getAnimeHistory call, with no per-item detail fetch', async () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(source.getAnimeHistory).toHaveBeenCalledTimes(1);
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
    expect(result.current.rows).toHaveLength(2);
  });

  it('reports isEmpty once loaded with zero entries', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isEmpty).toBe(true);
  });

  it('degrades to an empty, non-loading state when the fetch rejects', async () => {
    const source = {
      ...createSource([]),
      getAnimeHistory: vi.fn().mockRejectedValue(new Error('runtime unavailable')),
    };
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  it('debounces the search query before it narrows visible rows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const entries = [entry({ id: 'a', nombre: 'Frieren' }), entry({ id: 'b', nombre: 'Bocchi the Rock' })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onSearchQueryChange('frie');
    });

    expect(result.current.rows).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    await vi.waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.id).toBe('a');

    vi.useRealTimers();
  });

  it('filters visible rows by estado', async () => {
    const entries = [entry({ id: 'a', estado: 0 }), entry({ id: 'b', estado: 1 })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onEstadoFilterChange('1');
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.id).toBe('b');
  });

  it('paginates rows and exposes the total page count', async () => {
    const entries = Array.from({ length: HISTORY_TABLE_PAGE_SIZE + 5 }, (_, index) =>
      entry({ id: `anime-${index}`, nombre: `Anime ${index}` }),
    );
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.rows).toHaveLength(HISTORY_TABLE_PAGE_SIZE);

    act(() => {
      result.current.onPageChange(2);
    });

    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.rows).toHaveLength(5);
  });

  it('resets to page 1 when the estado filter changes', async () => {
    const entries = Array.from({ length: HISTORY_TABLE_PAGE_SIZE + 5 }, (_, index) =>
      entry({ id: `anime-${index}`, estado: index < HISTORY_TABLE_PAGE_SIZE ? 0 : 1 }),
    );
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onPageChange(2);
    });
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => {
      result.current.onEstadoFilterChange('1');
    });

    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.rows).toHaveLength(5);
  });

  it('exposes only client-side setters -- no backend write/mutation callable', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useHistoryTable({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current).sort()).toEqual(
      [
        'estadoFilter',
        'estadoOptions',
        'isEmpty',
        'isLoading',
        'onEstadoFilterChange',
        'onPageChange',
        'onSearchQueryChange',
        'page',
        'pageItems',
        'rows',
        'searchQuery',
        'totalPages',
      ].sort(),
    );
    expect(source.pullAnimesFromLegacy).not.toHaveBeenCalled();
    expect(source.triggerReconcile).not.toHaveBeenCalled();
  });
});
