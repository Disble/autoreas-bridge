import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { useAnimeDetailMutationVisit } from '../use-anime-detail-mutation-visit';

const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <StrictMode>{children}</StrictMode>
);

describe('useAnimeDetailMutationVisit', () => {
  it('invalidates the mounted visit synchronously during unmount cleanup', () => {
    const hook = renderHook(() => useAnimeDetailMutationVisit('anime-1'), { wrapper });
    const mountedVisit = hook.result.current;

    expect(mountedVisit.isActive('anime-1', 0)).toBe(true);

    hook.unmount();

    expect(mountedVisit.isActive('anime-1', 0)).toBe(false);
  });

  it('advances route generation without invalidating the current mounted instance', () => {
    const hook = renderHook(
      ({ animeId }: Readonly<{ animeId: string }>) => useAnimeDetailMutationVisit(animeId),
      { initialProps: { animeId: 'anime-1' }, wrapper },
    );
    const firstVisit = hook.result.current;

    act(() => hook.rerender({ animeId: 'anime-2' }));

    expect(firstVisit.isActive('anime-1', 0)).toBe(false);
    expect(hook.result.current.routeGeneration).toBe(1);
    expect(hook.result.current.isActive('anime-2', 1)).toBe(true);
  });
});
