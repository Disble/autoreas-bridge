import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AnimeMetadataCandidate } from '../../../metadata-lookup.types';
import type {
  AnimeMetadataLookupSource,
  MyAnimeListDetailResultDTO,
  MyAnimeListSearchResultDTO,
} from '../use-anime-metadata-lookup';
import { useAnimeMetadataLookup } from '../use-anime-metadata-lookup';

/**
 * Split out of `use-anime-metadata-lookup.test.ts` (`dharness/max-file-lines`,
 * CLAUDE.md's frontend 500-line hard fail) -- covers task 5b.2's "modal's
 * selection state": highlighting a candidate, and the sole confirm path
 * from a highlighted candidate to a mapped {@link AnimeMetadataSelection}.
 */

/**
 * Builds one minimal candidate -- only `malId` and `name` matter unless a
 * test overrides more.
 * @param overrides Per-test field replacements.
 * @returns A candidate with the given `malId`/`name`, plus any overrides.
 */
function candidate(overrides: Partial<AnimeMetadataCandidate> = {}): AnimeMetadataCandidate {
  return { malId: 41467, name: 'Bleach: Sennen Kessen-hen', ...overrides };
}

/**
 * Builds one successful search result DTO carrying `candidates`.
 * @param candidates The candidates the fake server "found".
 * @returns A search result DTO with outcome `'applied'`.
 */
function searchResult(candidates: readonly AnimeMetadataCandidate[]): MyAnimeListSearchResultDTO {
  return { outcome: 'applied', message: 'MyAnimeList search complete', candidates };
}

/**
 * Builds a fake lookup source whose two calls default to resolving with an
 * empty, successful result, so a test only overrides what it actually cares
 * about.
 * @param overrides Per-test replacements for either call.
 * @returns A fake source suitable for `renderHook`.
 */
function createFakeSource(
  overrides: Partial<AnimeMetadataLookupSource> = {},
): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue(searchResult([])),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'MyAnimeList detail loaded',
    } satisfies MyAnimeListDetailResultDTO),
    ...overrides,
  };
}

/**
 * Flushes exactly one queued deferred settlement into a real microtask tick,
 * so the awaiting `runSearch` continuation (its `setState` call) runs before
 * the test's next assertion or step.
 */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAnimeMetadataLookup -- candidate selection and confirm', () => {
  describe('selecting a candidate -- the modal\'s selection state (task 5b.2)', () => {
    it('highlights the candidate and fires no detail call on its own', () => {
      const detail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onSelectCandidate(41467);
      });

      expect(result.current.selectedMalId).toBe(41467);
      expect(detail).not.toHaveBeenCalled();
    });
  });

  describe('confirming the selection -- non-negotiable #5, hook half', () => {
    it('resolves to undefined and fires no detail call when nothing is selected', async () => {
      const detail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(selection).toBeUndefined();
      expect(detail).not.toHaveBeenCalled();
    });

    it('maps a successful confirm through toAnimeMetadataSelection, merging the selected candidate\'s search-payload image as coverURL', async () => {
      const search = vi.fn().mockResolvedValue(
        searchResult([candidate({ image: 'https://cdn.example/bleach.jpg' })]),
      );
      const detail = vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
        title: 'Bleach: Sennen Kessen-hen',
        type: 'TV',
        episodes: '13',
        duration: '24',
        source: 'Manga',
        studios: ['Pierrot'],
        genres: ['Action'],
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ SearchMyAnimeList: search, GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('bleach');
      });
      await vi.waitFor(() => expect(search).toHaveBeenCalled());
      await flushMicrotasks();

      act(() => {
        result.current.onSelectCandidate(41467);
      });

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(detail).toHaveBeenCalledExactlyOnceWith(41467);
      expect(selection).toEqual({
        name: 'Bleach: Sennen Kessen-hen',
        kind: '0',
        totalEpisodes: '13',
        duration: '24',
        origin: 'Manga',
        genres: 'Action',
        studios: 'Pierrot',
        coverURL: 'https://cdn.example/bleach.jpg',
        unfilled: [],
      });
    });

    it('merges the exact selected candidate\'s image, not the first candidate in the list', async () => {
      const first = candidate({ malId: 1, name: 'Naruto', image: 'https://cdn.example/naruto.jpg' });
      const second = candidate({ malId: 2, name: 'Naruto: Shippuden', image: 'https://cdn.example/shippuden.jpg' });
      const search = vi.fn().mockResolvedValue(searchResult([first, second]));
      const detail = vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
        title: 'Naruto: Shippuden',
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ SearchMyAnimeList: search, GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('naruto');
      });
      await vi.waitFor(() => expect(search).toHaveBeenCalled());
      await flushMicrotasks();

      act(() => {
        result.current.onSelectCandidate(2);
      });

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(detail).toHaveBeenCalledExactlyOnceWith(2);
      expect(selection).toMatchObject({ coverURL: 'https://cdn.example/shippuden.jpg' });
    });

    it('leaves coverURL unset, rather than throwing, if the selected id no longer matches any listed candidate', async () => {
      const detail = vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        // Never resolved by a search -- candidates stays empty, so this id
        // matches nothing in the current snapshot.
        result.current.onSelectCandidate(41467);
      });

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(selection).toMatchObject({ coverURL: undefined });
    });

    it('defaults name to an empty string when a successful detail result carries no title', async () => {
      const detail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onSelectCandidate(41467);
      });

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(selection).toMatchObject({ name: '' });
    });

    it('reports a failed confirm through confirmError and resolves to undefined', async () => {
      const detail = vi.fn().mockResolvedValue({
        outcome: 'error',
        message: 'MyAnimeList changed its page at "Type:"; metadata autofill cannot continue',
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onSelectCandidate(41467);
      });

      let selection: unknown;
      await act(async () => {
        selection = await result.current.onConfirmSelection();
      });

      expect(selection).toBeUndefined();
      expect(result.current.confirmError).toBe('MyAnimeList changed its page at "Type:"; metadata autofill cannot continue');
    });

    it('clears a prior selection and confirm error once the query changes', async () => {
      const detail = vi.fn().mockResolvedValue({ outcome: 'error', message: 'boom' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onSelectCandidate(41467);
      });
      await act(async () => {
        await result.current.onConfirmSelection();
      });
      expect(result.current.confirmError).not.toBe('');

      act(() => {
        result.current.onQueryChange('naruto');
      });

      expect(result.current.selectedMalId).toBeNull();
      expect(result.current.confirmError).toBe('');
    });
  });
});
