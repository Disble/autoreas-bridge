import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCatalogSession } from '../catalog-session.store';
import { useCatalogCriteria } from '../use-catalog-criteria';

beforeEach(() => {
  resetCatalogSession();
});

describe('useCatalogCriteria', () => {
  it('opens on the all-records default, sorted A–Z, in the grid', () => {
    const { result } = renderHook(() => useCatalogCriteria());

    expect(result.current.criteria).toEqual({ query: '', status: 'all', kind: 'all', genres: [] });
    expect(result.current.sort).toBe('name-asc');
    expect(result.current.view).toBe('grid');
  });

  it('sets the search, status, type, sort and view', () => {
    const { result } = renderHook(() => useCatalogCriteria());

    act(() => {
      result.current.onQueryChange('fri');
      result.current.onStatusSelectionChange(new Set(['1']));
      result.current.onKindSelectionChange(new Set(['3']));
      result.current.onSortChange('status');
      result.current.onViewSelectionChange(new Set(['list']));
    });

    expect(result.current.criteria).toEqual({ query: 'fri', status: '1', kind: '3', genres: [] });
    expect(result.current.sort).toBe('status');
    expect(result.current.view).toBe('list');
  });

  it('selects genres and removes the criterion a chip names', () => {
    const { result } = renderHook(() => useCatalogCriteria());

    act(() => {
      result.current.onStatusSelectionChange(new Set(['0']));
      result.current.onGenresSelectionChange(new Set(['Drama', 'Mecha']));
      result.current.onGenresSelectionChange(new Set(['Mecha']));
    });
    expect(result.current.criteria.genres).toEqual(['Mecha']);

    act(() => {
      result.current.onCriterionChipsRemove(new Set(['status']));
    });
    expect(result.current.criteria).toEqual({ query: '', status: 'all', kind: 'all', genres: ['Mecha'] });
  });

  it('resets only the filters, keeping the search', () => {
    const { result } = renderHook(() => useCatalogCriteria());

    act(() => {
      result.current.onQueryChange('fri');
      result.current.onStatusSelectionChange(new Set(['1']));
      result.current.onKindSelectionChange(new Set(['0']));
      result.current.onGenresSelectionChange(new Set(['Drama']));
    });
    act(() => result.current.onFiltersReset());

    expect(result.current.criteria).toEqual({ query: 'fri', status: 'all', kind: 'all', genres: [] });
  });

  it('clears the search and filters, keeping the sort and view', () => {
    const { result } = renderHook(() => useCatalogCriteria());

    act(() => {
      result.current.onQueryChange('fri');
      result.current.onGenresSelectionChange(new Set(['Drama']));
      result.current.onSortChange('kind');
      result.current.onViewSelectionChange(new Set(['list']));
    });
    act(() => result.current.onClearCriteria());

    expect(result.current.criteria).toEqual({ query: '', status: 'all', kind: 'all', genres: [] });
    expect(result.current.sort).toBe('kind');
    expect(result.current.view).toBe('list');
  });

  it('keeps the criteria, sort and view after the Catalog unmounts, as when opening a detail', () => {
    const first = renderHook(() => useCatalogCriteria());
    act(() => {
      first.result.current.onQueryChange('fri');
      first.result.current.onKindSelectionChange(new Set(['1']));
      first.result.current.onSortChange('name-desc');
      first.result.current.onViewSelectionChange(new Set(['list']));
    });
    first.unmount();

    const { result } = renderHook(() => useCatalogCriteria());

    expect(result.current.criteria).toEqual({ query: 'fri', status: 'all', kind: '1', genres: [] });
    expect(result.current.sort).toBe('name-desc');
    expect(result.current.view).toBe('list');
  });
});
