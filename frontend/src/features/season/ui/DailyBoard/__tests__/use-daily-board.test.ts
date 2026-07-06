import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useDailyBoard } from '../use-daily-board';

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([] as SeasonAnimeRow[]),
    importIntake: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

const CREATED: SeasonAnimeRow = {
  id: 'sa-a',
  rawName: 'Anime A',
  matchStatus: 'matched',
  matchedSlug: 'x',
  candidates: [],
  availability: 'created',
  animeId: 'anime-a',
};

describe('useDailyBoard', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes on mount and groups the rows', async () => {
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue([CREATED]) });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.groups.created).toHaveLength(1));
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('onMove stages the anime into the given section', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    await act(async () => {
      result.current.onMove('anime-a', 'Ver hoy');
    });
    expect(source.setAnimeDays).toHaveBeenCalledWith('anime-a', ['Ver hoy']);
  });

  it('onRecheck triggers an availability recheck', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    await act(async () => {
      result.current.onRecheck();
    });
    expect(source.recheckAvailability).toHaveBeenCalled();
  });
});
