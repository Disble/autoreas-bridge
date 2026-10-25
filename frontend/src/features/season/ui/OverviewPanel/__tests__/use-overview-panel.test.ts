import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useOverviewPanel } from '../use-overview-panel';

/** Builds a full SeasonSource test double, overridable per case. */
function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue({ id: 's1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: 0 }),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
    downloadSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
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
    getCheckTime: vi.fn().mockResolvedValue('21:00'),
    setCheckTime: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    ...overrides,
  };
}

/** Builds a created season anime row with the given grade and section. */
function createdRow(id: string, animeId: string, grade: number, section = 'Visto'): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    availableEpisodes: 0,
    animeId,
    section,
    sectionOrder: 0,
    grade,
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading: false,
    consideration: 'none',
  };
}

describe('useOverviewPanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('fetches both the season and its animes on mount', async () => {
    const source = createSource();
    renderHook(() => useOverviewPanel(source));

    await waitFor(() => {
      expect(source.getSeason).toHaveBeenCalled();
      expect(source.getSeasonAnimes).toHaveBeenCalled();
    });
  });

  it('reflects the mocked rows in the derived view model', async () => {
    const rows = [createdRow('a', 'anime-a', 5, 'Sin ver'), createdRow('b', 'anime-b', 0, 'Ver hoy')];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useOverviewPanel(source));

    await waitFor(() => expect(result.current.kpi.createdCount).toBe(2));
    expect(result.current.pipeline).toEqual([{ stage: 'pipeline', 'Sin ver': 1, 'Ver hoy': 1, Visto: 0 }]);
    expect(result.current.selectionOutcome).toEqual([{ dim: 'outcome', Approved: 1, Rejected: 0, 'No grade': 1 }]);
  });

  it('derives the outcome funnel and its meta line from the season and its rows', async () => {
    const uncreated = { ...createdRow('c', '', 0), availability: 'pending' };
    const source = createSource({
      getSeason: vi.fn().mockResolvedValue({ id: 's1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: new Date(2026, 6, 8, 12).getTime() }),
      getSeasonAnimes: vi.fn().mockResolvedValue([createdRow('a', 'anime-a', 5), createdRow('b', 'anime-b', 0), uncreated]),
    });
    const { result } = renderHook(() => useOverviewPanel(source));

    await waitFor(() => expect(result.current.outcomeMeta).toBe('Created July 8, 2026 · Minimum approval grade 4 · 1 intake name never created'));
    expect(result.current.outcomeSteps.map((step) => step.value)).toEqual(['3', '2', '1', '1']);
  });

  it('passes readOnly and errorMessage through from the store unchanged', async () => {
    const source = createSource();
    const { result } = renderHook(() => useOverviewPanel(source));

    await waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalled());
    expect(result.current.readOnly).toBe(false);
    expect(result.current.errorMessage).toBeUndefined();
  });
});
