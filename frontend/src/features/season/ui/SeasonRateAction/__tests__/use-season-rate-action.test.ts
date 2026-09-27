import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  SeasonAnimeRow,
  SeasonSnapshot,
  SeasonSource,
} from '../../../../../infrastructure/season-source/season-source.types';
import {
  getSeasonStoreState,
  resetSeasonStore,
  setSeasonStoreState,
} from '../../../../../shared/store/season-store/season-store.helpers';
import { useSeasonRateAction } from '../use-season-rate-action';

/** Builds the loaded season snapshot the shared store holds, with the status under test. */
function seasonSnapshot(status: string): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status,
    createdAt: 1_700_000_000_000,
  };
}

/** Builds a Wails-bindings stand-in for the season port, with per-test overrides. */
function createSource(rows: readonly SeasonAnimeRow[], overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue(rows),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue({ rail: [], grid: [] }),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    ...overrides,
  };
}

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

describe('useSeasonRateAction', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads candidates on mount and resolves the matching candidate while the season is open', async () => {
    setSeasonStoreState({ season: seasonSnapshot('open') });
    const source = createSource([created('anime-a', 4)]);
    const { result } = renderHook(() => useSeasonRateAction('anime-a', source));

    await waitFor(() => expect(result.current.candidate?.grade).toBe(4));
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('resolves no candidate for an anime outside the open season', async () => {
    setSeasonStoreState({ season: seasonSnapshot('open') });
    const source = createSource([created('anime-a', 4)]);
    const { result } = renderHook(() => useSeasonRateAction('anime-zzz', source));

    await waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalled());
    expect(result.current.candidate).toBeUndefined();
  });

  it('offers no candidate while a closed historical season is loaded read-only', async () => {
    const source = createSource([created('anime-a', 4)], {
      getPastSeason: vi.fn().mockResolvedValue(seasonSnapshot('closed')),
      getPastSeasonAnimes: vi.fn().mockResolvedValue([created('anime-a', 4)]),
    });
    await getSeasonStoreState().viewPastSeason(source, 'season-old');

    const { result } = renderHook(() => useSeasonRateAction('anime-a', source));

    await waitFor(() => expect(getSeasonStoreState().viewSeasonId).toBe('season-old'));
    expect(result.current.candidate).toBeUndefined();
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });
});
