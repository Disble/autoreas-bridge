import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useHistoryParams } from '../use-history-params';
import type { UseHistoryParamsResult } from '../use-history-params';

/**
 * Renders the router's current search string and last navigation type, so a
 * test can see a push vs. a replace write without reaching into react-router
 * internals.
 */
function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <>
      <span data-testid="search">{location.search}</span>
      <span data-testid="nav-type">{navigationType}</span>
    </>
  );
}

/**
 * Builds a `renderHook` wrapper seeded at the given `/history` URL, with a
 * sibling probe so `LocationProbe` can observe every write the hook makes.
 * @param initialEntry The starting router entry, e.g. `/history?status=1`.
 * @returns A wrapper component for `renderHook`'s `wrapper` option.
 */
function buildWrapper(initialEntry: string) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        {children}
        <LocationProbe />
      </MemoryRouter>
    );
  };
}

describe('useHistoryParams', () => {
  it('decodes the current URL into params', () => {
    const { result } = renderHook(() => useHistoryParams(), { wrapper: buildWrapper('/history?status=1&sort=oldest') });

    expect(result.current.params).toEqual({ search: '', order: 'oldest', status: 1 });
  });

  it.each<[string, (params: UseHistoryParamsResult) => void, string, 'PUSH' | 'REPLACE']>([
    ['setStatus', (params) => params.setStatus(2), 'status=2', 'PUSH'],
    ['setType', (params) => params.setType(3), 'type=3', 'PUSH'],
    ['setSort', (params) => params.setSort('oldest'), 'sort=oldest', 'PUSH'],
    ['setRange', (params) => params.setRange({ from: '2026-09-01', to: '2026-09-13' }), 'from=2026-09-01&to=2026-09-13', 'PUSH'],
    ['setSearch', (params) => params.setSearch('frieren'), 'q=frieren', 'REPLACE'],
    ['setSelection', (params) => params.setSelection('anime-1', 42), 'anime=anime-1&row=42', 'REPLACE'],
  ])('%s writes the URL', (_label, apply, expectedSearch, expectedNavigation) => {
    const { result } = renderHook(() => useHistoryParams(), { wrapper: buildWrapper('/history') });

    act(() => {
      apply(result.current);
    });

    expect(screen.getByTestId('search')).toHaveTextContent(`?${expectedSearch}`);
    expect(screen.getByTestId('nav-type')).toHaveTextContent(expectedNavigation);
  });

  it('never lets a replace write clobber a push write that landed after it', () => {
    const { result } = renderHook(() => useHistoryParams(), { wrapper: buildWrapper('/history') });

    act(() => {
      result.current.setStatus(2);
    });
    act(() => {
      // Simulates a debounced search resolving after the status push already landed.
      result.current.setSearch('frieren');
    });

    expect(screen.getByTestId('search')).toHaveTextContent('?q=frieren&status=2');
  });

  it('clears a field back to its default when written with undefined', () => {
    const { result } = renderHook(() => useHistoryParams(), { wrapper: buildWrapper('/history?status=2') });

    act(() => {
      result.current.setStatus(undefined);
    });

    expect(screen.getByTestId('search').textContent).toBe('');
  });
});
