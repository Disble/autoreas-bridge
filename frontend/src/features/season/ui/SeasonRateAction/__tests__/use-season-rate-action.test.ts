import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonQuerySource } from '../../../../../shared/contracts/season.types';
import { createSeasonDataSource, makeSeason, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { useDisplayedSeason } from '../../../../../shared/season/use-displayed-season';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useSeasonRateAction } from '../use-season-rate-action';

/** Builds the created season row that makes an anime gradeable from the Episodes card. */
function created(animeId: string, grade: number): SeasonAnimeRow {
  return {
    id: `sa-${animeId}`,
    rawName: animeId.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section: 'Sin ver', sectionOrder: 0,
    grade,
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading: false,
    consideration: 'none',  };
}

/**
 * Renders one card's rate action next to the Season route's season read, which loads the shared cache.
 * @param animeId The card's anime.
 * @param source The port both read through.
 * @returns The rate action's render result.
 */
function renderBesideSeasonRoute(animeId: string, source: SeasonQuerySource) {
  const { wrapper } = seasonQueryWrapper();
  renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper });
  return renderHook(() => useSeasonRateAction(animeId, source), { wrapper });
}

describe('useSeasonRateAction', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads candidates once and resolves the matching candidate while the season is open', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasonAnimes: vi.fn().mockResolvedValue([created('anime-a', 4)]) });
    const { result } = renderBesideSeasonRoute('anime-a', source);

    await waitFor(() => expect(result.current.candidate?.grade).toBe(4));
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('resolves no candidate for an anime outside the open season', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasonAnimes: vi.fn().mockResolvedValue([created('anime-a', 4)]) });
    const { result } = renderBesideSeasonRoute('anime-zzz', source);

    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalled());
    expect(result.current.candidate).toBeUndefined();
  });

  it('loads the candidates but never the season itself, offering nothing before the Season route loaded it', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([created('anime-a', 4)]) });
    const { result } = renderHook(() => useSeasonRateAction('anime-a', source), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1));
    expect(source.readSeason).not.toHaveBeenCalled();
    expect(result.current.candidate).toBeUndefined();
  });

  it('offers no candidate while the open season rows are still loading', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasonAnimes: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderBesideSeasonRoute('anime-a', source);

    await waitFor(() => expect(source.readSeason).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(result.current.candidate).toBeUndefined();
  });

  it('shows the fixed banner text when the candidates fail to load', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows down')) });
    renderHook(() => useSeasonRateAction('anime-a', source), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('Failed to load intake rows'));
  });

  it('offers no candidate while a closed historical season is viewed read-only', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSeasonDataSource({
      readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'season-old', status: 'closed' })),
      readPastSeasonAnimes: vi.fn().mockResolvedValue([created('anime-a', 4)]),
    });
    const { result } = renderBesideSeasonRoute('anime-a', source);

    await waitFor(() => expect(source.readPastSeasonAnimes).toHaveBeenCalledWith('season-old'));
    await act(async () => undefined);
    expect(result.current.candidate).toBeUndefined();
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();
  });
});
