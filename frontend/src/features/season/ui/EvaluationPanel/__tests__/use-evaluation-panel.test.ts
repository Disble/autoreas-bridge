import { act, renderHook as renderBridgeHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonQuerySource, SeasonSource } from '../../../../../shared/contracts/season.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useEvaluationPanel } from '../use-evaluation-panel';

/** Renders the hook with a ready season module. */
const renderHook: typeof renderBridgeHook = (callback, options) => renderBridgeHook(callback, {
  ...options,
  wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper,
});

/** Builds the season port this suite drives, overriding only what a case sets. */
function createSource(overrides: Partial<SeasonSource & SeasonQuerySource> = {}): SeasonSource & SeasonQuerySource {
  return {
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: false, downloadTime: '' }),
    triggerSeasonDownloads: vi.fn().mockResolvedValue(undefined),
    downloadSeasonAnimes: vi.fn().mockResolvedValue(undefined),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    openPage: vi.fn(),
    readSeason: vi.fn().mockResolvedValue(null),
    readSeasonAnimes: vi.fn().mockResolvedValue([]),
    readSeasons: vi.fn().mockResolvedValue([]),
    readPastSeason: vi.fn().mockResolvedValue(null),
    readPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/** Builds a created season anime row with one grade. */
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
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useEvaluationPanel(source, {}));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.ungradedCount).toBe(1);
    expect(source.readSeasonAnimes).toHaveBeenCalled();
  });

  it('lists ungraded candidates first and resolves each candidate cover once', async () => {
    const rows = [created('a', 'anime-a', 5), created('b', 'anime-b', 0), created('c', 'anime-c', 0, true)];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const getAnimeCover = vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` }));
    const { result } = renderHook(() => useEvaluationPanel(source, { getAnimeCover }));

    await waitFor(() => expect(result.current.getCoverThumb('anime-c')).toEqual({ coverSrc: 'data:anime-c', isLoading: false }));
    expect(result.current.items.map((item) => item.row.id)).toEqual(['b', 'a', 'c']);
    expect(result.current.getCoverThumb('anime-a')).toEqual({ coverSrc: 'data:anime-a', isLoading: false });
    expect(getAnimeCover.mock.calls).toEqual([['anime-b'], ['anime-a'], ['anime-c']]);
  });

  it('reads through the query rather than the legacy store read', async () => {
    const source = createSource();
    const { result } = renderHook(() => useEvaluationPanel(source, {}));
    await waitFor(() => expect(result.current.view.kind).toBe('empty'));
    expect(source.readSeasonAnimes).toHaveBeenCalled();
  });

  it('onSkip records the override for a row', async () => {
    const source = createSource();
    const { result } = renderHook(() => useEvaluationPanel(source, {}));
    await waitFor(() => expect(result.current.view.kind).toBe('empty'));

    await act(async () => {
      result.current.onSkip('sa-1');
    });

    expect(source.skipGrading).toHaveBeenCalledWith('sa-1');
    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(2));
  });
});
