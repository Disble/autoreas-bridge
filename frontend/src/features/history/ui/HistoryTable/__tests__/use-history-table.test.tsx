import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigationType, useSearchParams } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeHistoryEntry } from '../../../../../shared/contracts/anime.types';
import { HISTORY_TABLE_PAGE_SIZE, HISTORY_TABLE_SORT_NOMBRE_VALUE } from '../history-table.constants';
import { useHistoryTable } from '../use-history-table';

function wrapperWithInitialEntries(initialEntries: readonly string[]) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <MemoryRouter initialEntries={[...initialEntries]}>{children}</MemoryRouter>;
  };
}

const defaultWrapper = wrapperWithInitialEntries(['/history']);

/** Test-only combined hook: exposes the table state alongside the raw URL params and the last navigation action, to assert on the URL-write side of the hook (design D2's replace-vs-push distinction). */
function useHistoryTableWithUrlObservability(source: BridgeRuntimeSource) {
  const table = useHistoryTable({}, source);
  const [searchParams] = useSearchParams();
  const navigationType = useNavigationType();

  return { table, searchParams, navigationType };
}

function renderHistoryTableWithUrlObservability(
  source: BridgeRuntimeSource,
  initialEntries: readonly string[] = ['/history'],
) {
  return renderHook(() => useHistoryTableWithUrlObservability(source), {
    wrapper: wrapperWithInitialEntries(initialEntries),
  });
}

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
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
  });

  it('loads via a single getAnimeHistory call, with no per-item detail fetch', async () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(source.getAnimeHistory).toHaveBeenCalledTimes(1);
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
    expect(result.current.rows).toHaveLength(2);
  });

  it('reports isEmpty once loaded with zero entries', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isEmpty).toBe(true);
  });

  it('degrades to an empty, non-loading state when the fetch rejects', async () => {
    const source = {
      ...createSource([]),
      getAnimeHistory: vi.fn().mockRejectedValue(new Error('runtime unavailable')),
    };
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  it('debounces the search query before it narrows visible rows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const entries = [entry({ id: 'a', nombre: 'Frieren' }), entry({ id: 'b', nombre: 'Bocchi the Rock' })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

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
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onEstadoFilterChange('1');
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.id).toBe('b');
  });

  it('filters visible rows by tipo', async () => {
    const entries = [entry({ id: 'a', tipo: 0 }), entry({ id: 'b', tipo: 1 })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTipoFilterChange('1');
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.id).toBe('b');
  });

  it('sorts visible rows by the selected sort order', async () => {
    const entries = [entry({ id: 'b', nombre: 'Bocchi the Rock' }), entry({ id: 'a', nombre: 'Anohana' })];
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.map((row) => row.id)).toEqual(['b', 'a']);

    act(() => {
      result.current.onSortOrderChange(HISTORY_TABLE_SORT_NOMBRE_VALUE);
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b']));
  });

  it('paginates rows and exposes the total page count', async () => {
    const entries = Array.from({ length: HISTORY_TABLE_PAGE_SIZE + 5 }, (_, index) =>
      entry({ id: `anime-${index}`, nombre: `Anime ${index}` }),
    );
    const source = createSource(entries);
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

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
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

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
    const { result } = renderHook(() => useHistoryTable({}, source), { wrapper: defaultWrapper });

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
        'onSortOrderChange',
        'onTipoFilterChange',
        'page',
        'pageItems',
        'rows',
        'searchQuery',
        'sortOptions',
        'sortOrder',
        'tipoFilter',
        'tipoOptions',
        'totalPages',
      ].sort(),
    );
    expect(source.pullAnimesFromLegacy).not.toHaveBeenCalled();
    expect(source.triggerReconcile).not.toHaveBeenCalled();
  });

  describe('URL-persisted state', () => {
    it('restores search, estado, tipo, sort, and page from the initial URL', async () => {
      const entries = Array.from({ length: HISTORY_TABLE_PAGE_SIZE + 5 }, (_, index) =>
        entry({ id: `anime-${index}`, nombre: `Anime ${index}`, estado: 1, tipo: 0 }),
      );
      const source = createSource(entries);
      const { result } = renderHistoryTableWithUrlObservability(source, [
        '/history?estado=1&tipo=0&sort=nombre&page=2',
      ]);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      expect(result.current.table.estadoFilter).toBe('1');
      expect(result.current.table.tipoFilter).toBe('0');
      expect(result.current.table.sortOrder).toBe(HISTORY_TABLE_SORT_NOMBRE_VALUE);
      expect(result.current.table.page).toBe(2);
    });

    it('writes the estado filter to the URL using push navigation', async () => {
      const source = createSource([entry({ id: 'a', estado: 1 })]);
      const { result } = renderHistoryTableWithUrlObservability(source);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onEstadoFilterChange('1');
      });

      await waitFor(() => expect(result.current.table.estadoFilter).toBe('1'));
      expect(result.current.searchParams.get('estado')).toBe('1');
      expect(result.current.navigationType).toBe('PUSH');
    });

    it('writes the tipo filter to the URL using push navigation', async () => {
      const source = createSource([entry({ id: 'a', tipo: 1 })]);
      const { result } = renderHistoryTableWithUrlObservability(source);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onTipoFilterChange('1');
      });

      await waitFor(() => expect(result.current.table.tipoFilter).toBe('1'));
      expect(result.current.searchParams.get('tipo')).toBe('1');
      expect(result.current.navigationType).toBe('PUSH');
    });

    it('writes the sort order to the URL using push navigation', async () => {
      const source = createSource([entry({ id: 'a' })]);
      const { result } = renderHistoryTableWithUrlObservability(source);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onSortOrderChange(HISTORY_TABLE_SORT_NOMBRE_VALUE);
      });

      await waitFor(() => expect(result.current.table.sortOrder).toBe(HISTORY_TABLE_SORT_NOMBRE_VALUE));
      expect(result.current.searchParams.get('sort')).toBe(HISTORY_TABLE_SORT_NOMBRE_VALUE);
      expect(result.current.navigationType).toBe('PUSH');
    });

    it('writes the page to the URL using push navigation', async () => {
      const entries = Array.from({ length: HISTORY_TABLE_PAGE_SIZE + 5 }, (_, index) =>
        entry({ id: `anime-${index}` }),
      );
      const source = createSource(entries);
      const { result } = renderHistoryTableWithUrlObservability(source);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onPageChange(2);
      });

      await waitFor(() => expect(result.current.table.page).toBe(2));
      expect(result.current.searchParams.get('page')).toBe('2');
      expect(result.current.navigationType).toBe('PUSH');
    });

    it('writes the debounced search query to the URL using replace navigation, resetting the page', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const entries = [entry({ id: 'a', nombre: 'Frieren' }), entry({ id: 'b', nombre: 'Bocchi the Rock' })];
      const source = createSource(entries);
      const { result } = renderHistoryTableWithUrlObservability(source, ['/history?page=2']);

      await vi.waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onSearchQueryChange('frie');
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      await vi.waitFor(() => expect(result.current.searchParams.get('q')).toBe('frie'));
      expect(result.current.table.page).toBe(1);
      expect(result.current.navigationType).toBe('REPLACE');

      vi.useRealTimers();
    });

    it('omits default-valued params from the URL', async () => {
      const source = createSource([entry({ id: 'a', estado: 1 })]);
      const { result } = renderHistoryTableWithUrlObservability(source, ['/history?estado=1']);

      await waitFor(() => expect(result.current.table.isLoading).toBe(false));

      act(() => {
        result.current.table.onEstadoFilterChange('all');
      });

      await waitFor(() => expect(result.current.table.estadoFilter).toBe('all'));
      expect(result.current.searchParams.has('estado')).toBe(false);
    });
  });
});
