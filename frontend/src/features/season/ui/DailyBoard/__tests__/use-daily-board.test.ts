import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { useDailyBoard } from '../use-daily-board';

/** Builds the season port this suite drives, overriding only what a case sets. */
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

/** Builds a created season anime row for the board's sections. */
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
    sectionOrder: 0,
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

  it('onSendAndDownload sends the selection, clears it, then starts the season download and drops a late-send notice', async () => {
    const source = createSource({
      sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: true, downloadTime: '21:00' }),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-b'));
    await act(async () => {
      result.current.onSendToVerHoy();
    });
    expect(result.current.downloadNotice).toEqual({ downloadTime: '21:00' });
    act(() => result.current.toggleSelect('anime-a'));

    await act(async () => {
      result.current.onSendAndDownload();
    });

    expect(source.sendToVerHoy).toHaveBeenLastCalledWith(['anime-a']);
    expect(source.triggerSeasonDownloads).toHaveBeenCalledTimes(1);
    expect(vi.mocked(source.sendToVerHoy).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(source.triggerSeasonDownloads).mock.invocationCallOrder[0],
    );
    expect(result.current.selected.size).toBe(0);
    expect(result.current.downloadNotice).toBeNull();
  });

  it.each([
    { name: 'an empty selection', selection: [], sendStatus: 'ok' },
    { name: 'a failed send', selection: ['anime-a'], sendStatus: 'send failed' },
  ])('onSendAndDownload starts no download after $name', async ({ selection, sendStatus }) => {
    const source = createSource({
      sendToVerHoy: vi.fn().mockResolvedValue({ status: sendStatus, pastDownloadTime: false, downloadTime: '' }),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    for (const animeId of selection) {
      act(() => result.current.toggleSelect(animeId));
    }

    await act(async () => {
      result.current.onSendAndDownload();
    });

    expect(source.sendToVerHoy).toHaveBeenCalledTimes(selection.length);
    expect(source.triggerSeasonDownloads).not.toHaveBeenCalled();
  });

  it('onDownloadSelected downloads only the checked animes still in Ver hoy, then clears the selection', async () => {
    const rows = [createdRow('b', 'anime-b', 'Ver hoy'), createdRow('c', 'anime-c', 'Ver hoy')];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useDailyBoard(source));
    await waitFor(() => expect(result.current.sections.verHoy).toHaveLength(2));
    // anime-gone was checked before it drained out of Ver hoy.
    act(() => result.current.toggleVerHoySelect('anime-gone'));
    act(() => result.current.toggleVerHoySelect('anime-b'));
    expect([...result.current.verHoySelected]).toEqual(['anime-b']);

    await act(async () => {
      result.current.onDownloadSelected();
    });

    expect(source.downloadSeasonAnimes).toHaveBeenCalledWith(['anime-b']);
    expect(source.triggerSeasonDownloads).not.toHaveBeenCalled();
    expect(result.current.verHoySelected.size).toBe(0);
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('onDownloadSelected keeps the selection and surfaces why the run could not start', async () => {
    const source = createSource({
      getSeasonAnimes: vi.fn().mockResolvedValue([createdRow('b', 'anime-b', 'Ver hoy')]),
      downloadSeasonAnimes: vi.fn().mockResolvedValue('a download run is already in progress'),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    await waitFor(() => expect(result.current.sections.verHoy).toHaveLength(1));
    act(() => result.current.toggleVerHoySelect('anime-b'));

    await act(async () => {
      result.current.onDownloadSelected();
    });

    expect(result.current.errorMessage).toBe('a download run is already in progress');
    expect([...result.current.verHoySelected]).toEqual(['anime-b']);

    // Changing the selection retires the stale refusal.
    act(() => result.current.toggleVerHoySelect('anime-b'));
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('onDownloadSelected is a no-op with no checked Ver hoy anime', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleVerHoySelect('anime-gone'));

    await act(async () => {
      result.current.onDownloadSelected();
    });

    expect(source.downloadSeasonAnimes).not.toHaveBeenCalled();
  });

  it('resolves a cover for every board row, Visto included', async () => {
    const rows = [createdRow('a', 'anime-a', 'Sin ver'), createdRow('b', 'anime-b', 'Ver hoy'), createdRow('c', 'anime-c', 'Visto')];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const getAnimeCover = vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` }));
    const { result } = renderHook(() => useDailyBoard(source, { getAnimeCover }));

    await waitFor(() => expect(result.current.getCoverThumb('anime-b')).toEqual({ coverSrc: 'data:anime-b', isLoading: false }));
    expect(result.current.getCoverThumb('anime-a')).toEqual({ coverSrc: 'data:anime-a', isLoading: false });
    expect(result.current.getCoverThumb('anime-c')).toEqual({ coverSrc: 'data:anime-c', isLoading: false });
    expect(getAnimeCover.mock.calls).toEqual([['anime-a'], ['anime-b'], ['anime-c']]);
  });

  it('onRecheck triggers an availability recheck', async () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    await act(async () => {
      result.current.onRecheck();
    });
    expect(source.recheckAvailability).toHaveBeenCalled();
  });

  it('onOpenPage opens the page through the source (the external browser)', () => {
    const source = createSource();
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => {
      result.current.onOpenPage('https://example.com/a');
    });
    expect(source.openPage).toHaveBeenCalledWith('https://example.com/a');
  });

  /** Opens the given closed season read-only through the season store, as the history view does. */
  async function viewClosedSeason(source: SeasonSource, seasonId = 's1'): Promise<void> {
    await act(async () => {
      await getSeasonStoreState().viewPastSeason(source, seasonId);
    });
  }

  /** A stored closure snapshot carrying the given Daily board. */
  function storedSnapshot(dailyBoard: { readonly recorded: boolean; readonly entries: readonly unknown[] }) {
    return { recorded: true, rail: [], grid: [], dailyBoard };
  }

  it('builds a closed season’s sections from its stored Daily board, never from live sections', async () => {
    const rows = [createdRow('a', 'anime-a', 'Visto'), createdRow('b', 'anime-b', 'Jueves'), createdRow('c', 'anime-c', 'Sin ver')];
    const entries = [
      { rowId: 'b', animeId: 'anime-b', section: 'Ver hoy', order: 1 },
      { rowId: 'gone', animeId: 'anime-gone', section: 'Ver hoy', order: 2 },
      { rowId: 'a', animeId: 'anime-a', section: 'Sin ver', order: 1 },
    ];
    const source = createSource({
      getPastSeasonAnimes: vi.fn().mockResolvedValue(rows),
      getSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot({ recorded: true, entries })),
    });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    expect(result.current.boardMode).toBe('loading');
    await waitFor(() => expect(result.current.boardMode).toBe('sections'));
    const { sinVer, verHoy, visto } = result.current.sections;
    expect([sinVer, verHoy, visto].map((section) => section.map((row) => row.id))).toEqual([['a'], ['b'], []]);
    expect(source.getSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
    expect(result.current.getVerHoyRowChip(rows[1])).toBeNull();
  });

  it('lists a closed season that recorded no Daily board as one plain list', async () => {
    const rows = [createdRow('a', 'anime-a', 'Visto'), createdRow('b', 'anime-b', 'Ver hoy')];
    const source = createSource({
      getPastSeasonAnimes: vi.fn().mockResolvedValue(rows),
      getSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot({ recorded: false, entries: [] })),
    });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.boardMode).toBe('plain'));
    expect(result.current.plainRows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.sections.visto).toHaveLength(0);
  });

  it('reports a failed closed-season read instead of a board', async () => {
    const source = createSource({ getSeasonOrderingSnapshot: vi.fn().mockRejectedValue(new Error('read failed')) });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.boardMode).toBe('failed'));
    expect(result.current.historyError).toBe('read failed');
  });

  it('never reads the closure snapshot for the open season, and keeps the live weekday chip', async () => {
    const rows = [createdRow('a', 'anime-a', 'Ver hoy')];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows), getSeasonOrderingSnapshot: vi.fn() });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.sections.verHoy).toHaveLength(1));
    expect([result.current.boardMode, result.current.historyError]).toEqual(['sections', undefined]);
    expect(source.getSeasonOrderingSnapshot).not.toHaveBeenCalled();
    expect(result.current.getVerHoyRowChip({ ...rows[0], section: 'Jueves', sectionOrder: 3 })).toEqual({ label: 'Jueves - 3', color: 'accent' });
  });

  it('drops a closed-season read that settles after the viewed season changed', async () => {
    /** Settles the first (stale) read once the second season is on screen. */
    let settleFirst: (value: unknown) => void = () => undefined;
    const getSeasonOrderingSnapshot = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => { settleFirst = resolve; }))
      .mockResolvedValue(storedSnapshot({ recorded: false, entries: [] }));
    const source = createSource({ getSeasonOrderingSnapshot });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));
    await viewClosedSeason(source, 's2');
    await waitFor(() => expect(result.current.boardMode).toBe('plain'));

    await act(async () => {
      settleFirst(storedSnapshot({ recorded: true, entries: [] }));
    });
    expect(result.current.boardMode).toBe('plain');
  });
});
