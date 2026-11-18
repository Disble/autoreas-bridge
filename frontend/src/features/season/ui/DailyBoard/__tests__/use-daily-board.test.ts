import { act, renderHook as renderBridgeHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonQuerySource, SeasonSource } from '../../../../../shared/contracts/season.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useDailyBoard } from '../use-daily-board';

/** Renders each board with a fresh ready season query client. */
const renderHook: typeof renderBridgeHook = (callback, options) => renderBridgeHook(callback, {
  ...options,
  wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper,
});

/** Builds the season port this suite drives, overriding only what a case sets. */
function createSource(overrides: Partial<SeasonSource & SeasonQuerySource> = {}): SeasonSource & SeasonQuerySource {
  return {
    readSeason: vi.fn().mockResolvedValue(null),
    readSeasonAnimes: vi.fn().mockResolvedValue([] as readonly SeasonAnimeRow[]),
    readSeasons: vi.fn().mockResolvedValue([]),
    readPastSeason: vi.fn().mockResolvedValue(null),
    readPastSeasonAnimes: vi.fn().mockResolvedValue([] as readonly SeasonAnimeRow[]),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: false, downloadTime: '21:00' }),
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
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.sections.sinVer).toHaveLength(1));
    expect(result.current.sections.verHoy).toHaveLength(1);
    expect(source.readSeasonAnimes).toHaveBeenCalled();
  });

  it('passes a Sin-ver row\'s availableEpisodes through unchanged', async () => {
    const rows = [{ ...createdRow('a', 'anime-a', 'Sin ver'), availableEpisodes: 4 }];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
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
      sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: true, downloadTime: '21:00' }),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));

    await act(async () => {
      result.current.onSendToVerHoy();
    });
    expect(result.current.downloadNotice).toEqual({ downloadTime: '21:00' });

    // The download is a bridge mutation, so it starts on the next microtask.
    await act(async () => {
      result.current.onDownloadNow();
    });
    expect(source.triggerSeasonDownloads).toHaveBeenCalled();
    expect(result.current.downloadNotice).toBeNull();
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('surfaces why the season download could not start instead of confirming it', async () => {
    const source = createSource({
      readSeasonAnimes: vi.fn().mockResolvedValue([createdRow('b', 'anime-b', 'Ver hoy')]),
      triggerSeasonDownloads: vi.fn().mockRejectedValue(new Error('a download run is already in progress')),
    });
    const { result } = renderHook(() => useDailyBoard(source));
    await waitFor(() => expect(result.current.sections.verHoy).toHaveLength(1));

    await act(async () => {
      result.current.onDownloadNow();
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('a download run is already in progress'));
    expect(source.triggerSeasonDownloads).toHaveBeenCalledTimes(1);
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
      sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: true, downloadTime: '21:00' }),
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
    { name: 'an empty selection', selection: [], send: () => Promise.resolve({ pastDownloadTime: false, downloadTime: '' }) },
    { name: 'a failed send', selection: ['anime-a'], send: () => Promise.reject(new Error('send failed')) },
  ])('onSendAndDownload starts no download after $name', async ({ selection, send }) => {
    const source = createSource({ sendToVerHoy: vi.fn(send) });
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

  it('shows why a rejected Ver hoy send failed on the banner and keeps the rows unrefreshed', async () => {
    const source = createSource({ sendToVerHoy: vi.fn().mockRejectedValue(new Error('season is starting')) });
    const { result } = renderHook(() => useDailyBoard(source));
    act(() => result.current.toggleSelect('anime-a'));
    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.onSendToVerHoy();
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('season is starting'));
    expect(result.current.downloadNotice).toBeNull();
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('onDownloadSelected downloads only the checked animes still in Ver hoy, then clears the selection', async () => {
    const rows = [createdRow('b', 'anime-b', 'Ver hoy'), createdRow('c', 'anime-c', 'Ver hoy')];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
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
      readSeasonAnimes: vi.fn().mockResolvedValue([createdRow('b', 'anime-b', 'Ver hoy')]),
      downloadSeasonAnimes: vi.fn().mockRejectedValue(new Error('a download run is already in progress')),
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
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) });
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

  /** Switches the season store to the read-only past-season view, as the history view does. */
  async function viewClosedSeason(_source: SeasonSource, seasonId = 's1'): Promise<void> {
    await act(async () => {
      setSeasonStoreState({ viewSeasonId: seasonId, readOnly: true });
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
      readPastSeasonAnimes: vi.fn().mockResolvedValue(rows),
      fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot({ recorded: true, entries })),
    });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    expect(result.current.boardMode).toBe('loading');
    await waitFor(() => expect(result.current.boardMode).toBe('sections'));
    const { sinVer, verHoy, visto } = result.current.sections;
    expect([sinVer, verHoy, visto].map((section) => section.map((row) => row.id))).toEqual([['a'], ['b'], []]);
    expect(source.fetchSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
    expect(result.current.getVerHoyRowChip(rows[1])).toBeNull();
  });

  it('lists a closed season that recorded no Daily board as one plain list', async () => {
    const rows = [createdRow('a', 'anime-a', 'Visto'), createdRow('b', 'anime-b', 'Ver hoy')];
    const source = createSource({
      readPastSeasonAnimes: vi.fn().mockResolvedValue(rows),
      fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot({ recorded: false, entries: [] })),
    });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.boardMode).toBe('plain'));
    expect(result.current.plainRows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.sections.visto).toHaveLength(0);
  });

  it('reports a failed closed-season read instead of a board', async () => {
    const source = createSource({ fetchSeasonOrderingSnapshot: vi.fn().mockRejectedValue(new Error('read failed')) });
    await viewClosedSeason(source);
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.boardMode).toBe('failed'));
    expect(result.current.boardError).toBe('read failed');
  });

  it('reports a failed rows read instead of an empty board', async () => {
    const source = createSource({ readSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows failed')) });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.boardMode).toBe('failed'));
    expect(result.current.boardError).toBe('rows failed');
  });

  it('never reads the closure snapshot for the open season, and keeps the live weekday chip', async () => {
    const rows = [createdRow('a', 'anime-a', 'Ver hoy')];
    const source = createSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows), fetchSeasonOrderingSnapshot: vi.fn() });
    const { result } = renderHook(() => useDailyBoard(source));

    await waitFor(() => expect(result.current.sections.verHoy).toHaveLength(1));
    expect([result.current.boardMode, result.current.boardError]).toEqual(['sections', undefined]);
    expect(source.fetchSeasonOrderingSnapshot).not.toHaveBeenCalled();
    expect(result.current.getVerHoyRowChip({ ...rows[0], section: 'Jueves', sectionOrder: 3 })).toEqual({ label: 'Jueves - 3', color: 'accent' });
  });
});
