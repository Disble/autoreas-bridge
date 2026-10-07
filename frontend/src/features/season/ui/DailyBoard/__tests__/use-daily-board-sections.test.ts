import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { useDailyBoardSections } from '../use-daily-board-sections';

/** Builds created rows in one section, carrying only the fields this hook reads. */
function rows(section: string, ...animeIds: readonly string[]): SeasonAnimeRow[] {
  return animeIds.map((animeId) => ({ id: `${section}-${animeId}`, animeId, availability: 'created', section }) as SeasonAnimeRow);
}

/** Builds a cover port whose binding resolves every id to its own data URL. */
function coverSource() {
  return { getAnimeCover: vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` })) };
}

describe('useDailyBoardSections', () => {
  it('groups the rows and shows a requested cover loading, then resolved', async () => {
    const source = coverSource();
    const { result } = renderHook(() => useDailyBoardSections(rows('Sin ver', 'a'), source));

    expect(result.current.sections.sinVer.map((row) => row.animeId)).toEqual(['a']);
    expect(result.current.getCoverThumb('a')).toEqual({ coverSrc: undefined, isLoading: true });
    await waitFor(() => expect(result.current.getCoverThumb('a')).toEqual({ coverSrc: 'data:a', isLoading: false }));
  });

  it('requests each non-empty board id once, across sections, duplicates and re-renders', async () => {
    const source = coverSource();
    const { result, rerender } = renderHook(({ board }) => useDailyBoardSections(board, source), {
      initialProps: { board: [...rows('Sin ver', 'a', 'a', ''), ...rows('Visto', 'v')] },
    });
    await waitFor(() => expect(result.current.getCoverThumb('a').coverSrc).toBe('data:a'));

    rerender({ board: [...rows('Sin ver', 'a'), ...rows('Ver hoy', 'b'), ...rows('Visto', 'v')] });
    rerender({ board: [...rows('Sin ver', 'b'), ...rows('Lunes', 'a'), ...rows('Ver hoy', 'v')] });
    await waitFor(() => expect(result.current.getCoverThumb('b').coverSrc).toBe('data:b'));

    expect(source.getAnimeCover.mock.calls).toEqual([['a'], ['v'], ['b']]);
    expect(result.current.getCoverThumb('v')).toEqual({ coverSrc: 'data:v', isLoading: false });
  });
});
