import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useEvaluationPanel } from '../use-evaluation-panel';

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
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

function created(id: string, animeId: string, grade: number, skipGrading = false): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section: 'Visto', sectionOrder: 0,
    grade,
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading,
    consideration: 'none',  };
}

describe('useEvaluationPanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads candidates on mount and counts the ungraded ones', async () => {
    const rows = [created('a', 'anime-a', 0), created('b', 'anime-b', 5)];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useEvaluationPanel(source));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.ungradedCount).toBe(1);
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('onSkip records the override for a row', async () => {
    const source = createSource();
    const { result } = renderHook(() => useEvaluationPanel(source));

    await act(async () => {
      result.current.onSkip('sa-1');
    });

    expect(source.skipGrading).toHaveBeenCalledWith('sa-1');
  });
});
