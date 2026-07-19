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
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: false, downloadTime: '21:00' }),
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

function createdRow(id: string, animeId: string, section: string): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',  };
}

describe('useDailyBoard', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes on mount and groups created animes by section', async () => {
    const rows = [createdRow('a', 'anime-a', 'Sin ver'), createdRow('b', 'anime-b', 'Ver hoy')];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.sections.sinVer).toHaveLength(1));
    expect(result.current.sections.verHoy).toHaveLength(1);
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('passes a Sin-ver row\'s availableEpisodes through unchanged', async () => {
    const rows = [{ ...createdRow('a', 'anime-a', 'Sin ver'), availableEpisodes: 4 }];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.sections.sinVer).toHaveLength(1));
    expect(result.current.sections.sinVer[0]?.availableEpisodes).toBe(4);
  });

  it('toggleSelect adds and removes anime ids', () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));
    expect(result.current.selected.has('anime-a')).toBe(true);
    act(() => result.current.toggleSelect('anime-a'));
    expect(result.current.selected.has('anime-a')).toBe(false);
  });

  it('onSendToVerHoy sends the selection and clears it', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));
    act(() => result.current.toggleSelect('anime-b'));

    await act(async () => {
      result.current.onSendToVerHoy();
    });

    expect(source.sendToVerHoy).toHaveBeenCalledWith(['anime-a', 'anime-b']);
    expect(result.current.selected.size).toBe(0);
  });

  it('raises a manual-download notice when the batch missed the auto-download window', async () => {
    const source = createSource({
      sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: true, downloadTime: '21:00' }),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));

    await act(async () => {
      result.current.onSendToVerHoy();
    });
    expect(result.current.downloadNotice).toEqual({ downloadTime: '21:00' });

    act(() => result.current.onDownloadNow());
    expect(source.triggerSeasonDownloads).toHaveBeenCalled();
    expect(result.current.downloadNotice).toBeNull();
  });

  it('keeps no notice when the batch rides the scheduled auto-download', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));
    await act(async () => {
      result.current.onSendToVerHoy();
    });
    expect(result.current.downloadNotice).toBeNull();
  });

  it('onSendToVerHoy is a no-op with an empty selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    await act(async () => {
      result.current.onSendToVerHoy();
    });
    expect(source.sendToVerHoy).not.toHaveBeenCalled();
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
