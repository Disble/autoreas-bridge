import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { useCatalogLensSwitch } from '../use-catalog-lens-switch';

function renderAtPath(initialPath: string) {
  const locationRef = { current: initialPath };

  function LocationTracker() {
    locationRef.current = useLocation().pathname;
    return null;
  }

  const hookResult = renderHook(() => useCatalogLensSwitch({}), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationTracker />
        {children}
      </MemoryRouter>
    ),
  });

  return { ...hookResult, locationRef };
}

describe('useCatalogLensSwitch', () => {
  it('derives activeLens "catalog" from the /catalog path', () => {
    const { result } = renderAtPath('/catalog');

    expect(result.current.activeLens).toBe('catalog');
  });

  it('derives activeLens "history" from the /catalog/history path', () => {
    const { result } = renderAtPath('/catalog/history');

    expect(result.current.activeLens).toBe('history');
  });

  it('navigates to /catalog/history when onLensChange("history") is called', () => {
    const { result, locationRef } = renderAtPath('/catalog');

    act(() => {
      result.current.onLensChange('history');
    });

    expect(locationRef.current).toBe('/catalog/history');
  });

  it('navigates to /catalog when onLensChange("catalog") is called', () => {
    const { result, locationRef } = renderAtPath('/catalog/history');

    act(() => {
      result.current.onLensChange('catalog');
    });

    expect(locationRef.current).toBe('/catalog');
  });
});
