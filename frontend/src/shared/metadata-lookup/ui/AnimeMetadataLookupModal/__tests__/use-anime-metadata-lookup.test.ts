import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../metadata-lookup.constants';
import type { AnimeMetadataCandidate } from '../../../metadata-lookup.types';
import type {
  AnimeMetadataLookupSource,
  MyAnimeListDetailResultDTO,
  MyAnimeListSearchResultDTO,
} from '../use-anime-metadata-lookup';
import { useAnimeMetadataLookup } from '../use-anime-metadata-lookup';

/**
 * A promise plus the callback that settles it, so a test can control the
 * arrival order of two concurrent fake requests independent of call order --
 * the whole point of the newest-wins stale-drop tests.
 */
interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

/**
 * Builds a deferred promise.
 * @returns The pending promise and the function that settles it.
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Builds one minimal candidate -- only `malId` and `name` matter to these tests.
 * @param malId MyAnimeList's numeric anime id.
 * @param name The candidate's display title.
 * @returns A candidate carrying no optional fields.
 */
function candidate(malId: number, name: string): AnimeMetadataCandidate {
  return { malId, name };
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
 * Advances the fake debounce timer by exactly `METADATA_LOOKUP_DEBOUNCE_MS`,
 * inside `act`, so any resulting `setState` call from a fired request is
 * flushed before the test's next assertion or step.
 */
function advancePastDebounce(): void {
  act(() => {
    vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS);
  });
}

/**
 * Flushes exactly one queued deferred settlement into a real microtask tick,
 * so the awaiting `runSearch` continuation (its `setState` call) runs before
 * the test's next assertion.
 */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAnimeMetadataLookup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('newest-wins sequencing -- non-negotiable #9', () => {
    it('drops a stale response that resolves after a newer request already settled', async () => {
      const bleach = createDeferred<MyAnimeListSearchResultDTO>();
      const naruto = createDeferred<MyAnimeListSearchResultDTO>();
      const search = vi.fn().mockReturnValueOnce(bleach.promise).mockReturnValueOnce(naruto.promise);
      const source = createFakeSource({ SearchMyAnimeList: search });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('bleach');
      });
      advancePastDebounce();

      act(() => {
        result.current.onQueryChange('naruto');
      });
      advancePastDebounce();

      expect(search).toHaveBeenCalledTimes(2);

      // The newer request (naruto) settles first.
      naruto.resolve(searchResult([candidate(1, 'Naruto')]));
      await flushMicrotasks();
      expect(result.current.candidates).toEqual([candidate(1, 'Naruto')]);

      // The stale request (bleach) settles after -- it must be dropped.
      bleach.resolve(searchResult([candidate(2, 'Bleach')]));
      await flushMicrotasks();

      expect(result.current.state).toBe('resolved');
      expect(result.current.candidates).toEqual([candidate(1, 'Naruto')]);
    });
  });

  describe('one search session -- non-negotiable #9 and #5', () => {
    it('skips a sub-minimum query, coalesces rapid changes, hits the cache, and fetches detail only on confirm', async () => {
      const search = vi.fn().mockResolvedValue(searchResult([candidate(1, 'Bleach: Sennen Kessen-hen')]));
      const detail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({ SearchMyAnimeList: search, GetMyAnimeListDetail: detail });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('bl');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(search).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
      expect(result.current.candidates).toEqual([]);

      act(() => {
        result.current.onQueryChange('ble');
      });
      act(() => {
        vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS - 50);
      });
      act(() => {
        result.current.onQueryChange('bleach');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith('bleach');
      expect(result.current.state).toBe('resolved');
      expect(detail).not.toHaveBeenCalled();

      // Re-typing a differently-cased, differently-spaced form of the same
      // normalized query must hit the cache, not the source.
      act(() => {
        result.current.onQueryChange('  Bleach  ');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(search).toHaveBeenCalledTimes(1);
      expect(result.current.candidates).toEqual([candidate(1, 'Bleach: Sennen Kessen-hen')]);

      await act(async () => {
        await result.current.confirmCandidate(41467);
      });

      expect(detail).toHaveBeenCalledExactlyOnceWith(41467);
    });
  });

  describe('name pre-fill, first-open-only', () => {
    it('seeds the query from the latest name prop on the first open only', async () => {
      const search = vi.fn().mockResolvedValue(searchResult([candidate(1, 'Bleach: Sennen Kessen-hen')]));
      const source = createFakeSource({ SearchMyAnimeList: search });
      const { result, rerender } = renderHook(
        ({ name }: { name: string }) => useAnimeMetadataLookup(name, source),
        { initialProps: { name: 'Old Name' } },
      );

      rerender({ name: 'Bleach: Sennen Kessen-hen' });

      act(() => {
        result.current.onOpenChange(true);
      });

      expect(result.current.query).toBe('Bleach: Sennen Kessen-hen');
      advancePastDebounce();
      await flushMicrotasks();
      expect(search).toHaveBeenCalledTimes(1);

      // The user refines the seeded query.
      act(() => {
        result.current.onQueryChange('Bleach: Sennen Kessen-hen Part 2');
      });
      advancePastDebounce();
      await flushMicrotasks();

      // Closing and reopening the modal must not overwrite the refined query.
      act(() => {
        result.current.onOpenChange(false);
      });
      act(() => {
        result.current.onOpenChange(true);
      });

      expect(result.current.query).toBe('Bleach: Sennen Kessen-hen Part 2');
    });
  });

  describe('search outcomes', () => {
    it('moves to failed on an error outcome, then resolves a zero-candidate no_op with no error message', async () => {
      const search = vi
        .fn()
        .mockResolvedValueOnce({ outcome: 'error', message: 'MyAnimeList changed its page at "Type:"' } satisfies MyAnimeListSearchResultDTO)
        .mockResolvedValueOnce({ outcome: 'no_op', message: 'no MyAnimeList matches found' } satisfies MyAnimeListSearchResultDTO);
      const source = createFakeSource({ SearchMyAnimeList: search });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('bleach');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(result.current.state).toBe('failed');
      expect(result.current.candidates).toEqual([]);
      expect(result.current.errorMessage).toBe('MyAnimeList changed its page at "Type:"');

      act(() => {
        result.current.onQueryChange('shokuguemi no soma');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(result.current.state).toBe('resolved');
      expect(result.current.candidates).toEqual([]);
      expect(result.current.errorMessage).toBe('');
    });
  });

  describe('initial and in-flight snapshots', () => {
    it('starts idle with an empty query, then reports loading with no candidates or error while in flight', async () => {
      const pending = createDeferred<MyAnimeListSearchResultDTO>();
      const search = vi.fn().mockReturnValue(pending.promise);
      const source = createFakeSource({ SearchMyAnimeList: search });
      const { result } = renderHook(() => useAnimeMetadataLookup('', source));

      expect(result.current.query).toBe('');
      expect(result.current.state).toBe('idle');
      expect(result.current.candidates).toEqual([]);
      expect(result.current.errorMessage).toBe('');

      act(() => {
        result.current.onQueryChange('bleach');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(result.current.state).toBe('loading');
      expect(result.current.candidates).toEqual([]);
      expect(result.current.errorMessage).toBe('');

      pending.resolve(searchResult([candidate(1, 'Bleach: Sennen Kessen-hen')]));
      await flushMicrotasks();
    });
  });

  describe('reacting to a changed source across re-renders', () => {
    it('searches and confirms through the latest source rather than a stale closure', async () => {
      const staleSearch = vi.fn().mockResolvedValue(searchResult([candidate(1, 'Stale')]));
      const freshSearch = vi.fn().mockResolvedValue(searchResult([candidate(2, 'Fresh')]));
      const staleDetail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const freshDetail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const staleSource = createFakeSource({ SearchMyAnimeList: staleSearch, GetMyAnimeListDetail: staleDetail });
      const freshSource = createFakeSource({ SearchMyAnimeList: freshSearch, GetMyAnimeListDetail: freshDetail });
      const { result, rerender } = renderHook(
        ({ source }: { source: AnimeMetadataLookupSource }) => useAnimeMetadataLookup('', source),
        { initialProps: { source: staleSource } },
      );

      rerender({ source: freshSource });

      act(() => {
        result.current.onQueryChange('bleach');
      });
      advancePastDebounce();
      await flushMicrotasks();

      expect(staleSearch).not.toHaveBeenCalled();
      expect(freshSearch).toHaveBeenCalledWith('bleach');
      expect(result.current.candidates).toEqual([candidate(2, 'Fresh')]);

      await act(async () => {
        await result.current.confirmCandidate(41467);
      });

      expect(staleDetail).not.toHaveBeenCalled();
      expect(freshDetail).toHaveBeenCalledExactlyOnceWith(41467);
    });
  });

  describe('teardown', () => {
    it('clears its pending debounce timer on unmount, so no request fires afterward', () => {
      const search = vi.fn().mockResolvedValue(searchResult([]));
      const source = createFakeSource({ SearchMyAnimeList: search });
      const { result, unmount } = renderHook(() => useAnimeMetadataLookup('', source));

      act(() => {
        result.current.onQueryChange('bleach');
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS);
      });

      expect(search).not.toHaveBeenCalled();
    });
  });
});
