import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSeasonCovers } from '../use-season-covers';

/** Builds a cover port whose binding resolves every id to its own data URL. */
function coverSource() {
  return { getAnimeCover: vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` })) };
}

/** The thumbnail props of an anime with no cover. */
const PLACEHOLDER = { coverSrc: undefined, isLoading: false };

describe('useSeasonCovers', () => {
  it('shows a requested cover loading, then resolved', async () => {
    const { result } = renderHook(() => useSeasonCovers(['a'], coverSource()));

    expect(result.current('a')).toEqual({ coverSrc: undefined, isLoading: true });
    await waitFor(() => expect(result.current('a')).toEqual({ coverSrc: 'data:a', isLoading: false }));
  });

  it('requests each non-empty id once, across duplicates and new id lists', async () => {
    const source = coverSource();
    const { result, rerender } = renderHook(({ ids }) => useSeasonCovers(ids, source), {
      initialProps: { ids: ['a', 'a', ''] as readonly string[] },
    });
    await waitFor(() => expect(result.current('a').coverSrc).toBe('data:a'));

    rerender({ ids: ['b', 'a'] });
    await waitFor(() => expect(result.current('b').coverSrc).toBe('data:b'));

    expect(source.getAnimeCover.mock.calls).toEqual([['a'], ['b']]);
  });

  it('degrades a placeholder answer to the placeholder', async () => {
    const getAnimeCover = () => Promise.resolve({ source: 'placeholder' });
    const { result } = renderHook(() => useSeasonCovers(['a'], { getAnimeCover }));

    await waitFor(() => expect(result.current('a')).toEqual(PLACEHOLDER));
  });

  it('degrades only the rejected lookup to the placeholder, keeping the other covers', async () => {
    /** Resolves `a` to a cover and rejects every other id. */
    const getAnimeCover = (animeId: string) =>
      animeId === 'a' ? Promise.resolve({ source: 'cover', dataUrl: 'data:a' }) : Promise.reject(new Error('boom'));
    const { result } = renderHook(() => useSeasonCovers(['a', 'b'], { getAnimeCover }));

    await waitFor(() => expect(result.current('b')).toEqual(PLACEHOLDER));
    expect(result.current('a')).toEqual({ coverSrc: 'data:a', isLoading: false });
  });

  it('degrades every id to the placeholder when the binding is absent', () => {
    const { result } = renderHook(() => useSeasonCovers(['a'], {}));

    expect(result.current('a')).toEqual(PLACEHOLDER);
  });
});
