import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useSeasonRateAction } from '../use-season-rate-action';

function createSource(rows: readonly SeasonAnimeRow[]): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue(rows),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
  };
}

function created(animeId: string, grade: number): SeasonAnimeRow {
  return {
    id: `sa-${animeId}`,
    rawName: animeId.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableChapters: 0,
    animeId,
    section: 'Sin ver',
    grade,
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading: false,
    consideration: 'none',  };
}

describe('useSeasonRateAction', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads candidates on mount and resolves the matching candidate', async () => {
    const source = createSource([created('anime-a', 4)]);
    const { result } = renderHook(() => useSeasonRateAction('anime-a', source));

    await waitFor(() => expect(result.current.candidate?.grade).toBe(4));
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('resolves no candidate for an anime outside the season', async () => {
    const source = createSource([created('anime-a', 4)]);
    const { result } = renderHook(() => useSeasonRateAction('anime-zzz', source));

    await waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalled());
    expect(result.current.candidate).toBeUndefined();
  });
});
