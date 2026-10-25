import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { AnimeEditorRecord, AnimeEditorScheduleBoard } from '../../../../../shared/contracts/anime.types';
import { useAnimeEditorWorkspace } from '../use-anime-editor-workspace';
import { createEmptyEpisodeDurationSource } from './episode-duration-source.test-support';

/** Router context the hook needs, since it reads and writes navigation state. */
const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => createElement(MemoryRouter, undefined, children);

/**
 * Builds one editor record.
 * @param animeId The record's id.
 * @param folder The saved folder.
 * @returns The record.
 */
function record(animeId: string, folder = 'D:/Anime/Frieren'): AnimeEditorRecord {
  return {
    animeId, modifiedAt: 100,
    frequent: { name: animeId, status: 0, progress: 1, totalEpisodes: 12, active: true, kind: 0, page: '', folder, placements: [] },
    details: { genres: [], studios: { kind: 'missing', values: [] } },
  };
}

/**
 * Builds a board where `anime-1` is second of two on Lunes.
 * @param boardModifiedAt The board stamp.
 * @returns The board.
 */
function board(boardModifiedAt = 100): AnimeEditorScheduleBoard {
  return {
    originAnimeId: 'anime-1', boardModifiedAt,
    destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }, { id: 'Martes', label: 'Martes', kind: 'weekday' }],
    entries: [
      { animeId: 'other', name: 'Other', active: true, modifiedAt: 1, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 0, originHighlighted: false },
      { animeId: 'anime-1', name: 'anime-1', active: true, modifiedAt: 1, placements: [{ day: 'Lunes', order: 2 }], status: 0, progress: 0, originHighlighted: true },
    ],
  };
}

/**
 * Builds the editor's data source with every call stubbed.
 * @returns The stubbed source.
 */
function createSource() {
  return {
    getAnimes: vi.fn().mockResolvedValue([
      { id: 'anime-1', nombre: 'anime-1', estado: 0, nrocapvisto: 1, activo: 1, dias: [], generos: [], hasDownloadPage: true, hasFolder: true },
      { id: 'anime-2', nombre: 'anime-2', estado: 0, nrocapvisto: 1, activo: 1, dias: [], generos: [], hasDownloadPage: true, hasFolder: true },
    ]),
    getAnimeEditorRecord: vi.fn().mockImplementation(async (animeId: string) => ({ outcome: 'applied', message: 'loaded', record: record(animeId) })),
    saveAnimeEditor: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'saved', modifiedAt: 101, record: record('anime-1', 'D:/Anime/Moved') }),
    getAnimeEditorScheduleBoard: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: board() }),
    applyAnimeEditorSchedule: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'applied', modifiedAt: 101, board: { ...board(101), originAnimeId: '' } }),
  };
}

/**
 * Renders the workspace on anime-1 and waits for its record and its board.
 * @param episodeSource The Episodes card source.
 * @param configure Adjusts the editor source before the first render.
 * @returns The render result plus the source.
 */
async function loadHook(episodeSource: EpisodeDurationRuntimeSource = createEmptyEpisodeDurationSource(), configure?: (source: ReturnType<typeof createSource>) => void) {
  const source = createSource();
  configure?.(source);
  const rendered = renderHook(() => useAnimeEditorWorkspace({ initialAnimeId: 'anime-1' }, source as never, episodeSource), { wrapper });
  await waitFor(() => expect(rendered.result.current.selectedRecord?.animeId).toBe('anime-1'));
  await waitFor(() => expect(rendered.result.current.episodes.view).not.toBe('loading'));
  return { ...rendered, source, episodeSource };
}

/**
 * Adds episode 1 at 24 minutes to the Episodes card draft.
 * @param result The hook result.
 */
function addEpisode(result: { readonly current: ReturnType<typeof useAnimeEditorWorkspace> }): void {
  act(() => result.current.episodes.onOpenAdd());
  act(() => result.current.episodes.onAddEpisodeChange('1'));
  act(() => result.current.episodes.onAddMinutesChange('24'));
  act(() => result.current.episodes.onApplyAdd());
}

/**
 * A promise the test settles by hand.
 * @returns The promise and its resolve and reject.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/**
 * Builds a board answer placing `animeId` alone on `day`.
 * @param animeId The placed anime.
 * @param day The day it airs.
 * @returns The board answer.
 */
function boardAnswer(animeId: string, day: string) {
  return { outcome: 'applied' as const, message: 'loaded', board: { ...board(), entries: [{ ...board().entries[1]!, animeId, placements: [{ day, order: 1 }] }] } };
}

describe('useAnimeEditorWorkspace Schedule card reads', () => {
  it('shows the week loading while the board read is in flight', async () => {
    const source = createSource();
    source.getAnimeEditorScheduleBoard.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAnimeEditorWorkspace({ initialAnimeId: 'anime-1' }, source as never, createEmptyEpisodeDurationSource()), { wrapper });

    await waitFor(() => expect(result.current.scheduleWeek).toEqual({ status: 'loading', days: [], seasonDays: [] }));
  });

  it('reads no board before any anime is selected', async () => {
    const source = createSource();
    source.getAnimes.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source as never, createEmptyEpisodeDurationSource()), { wrapper });
    await act(async () => undefined);

    expect(source.getAnimeEditorScheduleBoard).not.toHaveBeenCalled();
    expect(result.current.scheduleWeek).toEqual({ status: 'idle', days: [], seasonDays: [] });
  });

  it('neither opens the schedule editor nor saves anything before any anime is selected', async () => {
    const source = createSource();
    source.getAnimes.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source as never, createEmptyEpisodeDurationSource()), { wrapper });

    await act(() => result.current.onOpenSchedule());
    let saved: unknown = 'pending';
    await act(async () => { saved = await result.current.onSave(); });

    expect(source.getAnimeEditorScheduleBoard).not.toHaveBeenCalled();
    expect(result.current.isScheduleModalOpen).toBe(false);
    expect(saved).toBeUndefined();
    expect(source.saveAnimeEditor).not.toHaveBeenCalled();
  });

  it('keeps the week when a schedule apply answers without a board', async () => {
    const { result, source } = await loadHook();
    await act(() => result.current.onOpenSchedule());
    source.applyAnimeEditorSchedule.mockResolvedValueOnce({ outcome: 'conflict', message: 'stale', modifiedAt: 0 });

    await act(() => result.current.onApplySchedule([]));

    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: 2 of 2', 'Martes: not scheduled']);
    expect(result.current.scheduleFeedback).toBe('stale');
  });

  it.each([
    { settle: 'resolves', late: (read: ReturnType<typeof deferred>) => read.resolve(boardAnswer('anime-1', 'Lunes')) },
    { settle: 'fails', late: (read: ReturnType<typeof deferred>) => read.reject(new Error('offline')) },
  ])('ignores the board read of the previous anime when it $settle after the new one', async ({ late }) => {
    const first = deferred();
    const { result } = await loadHook(undefined, (source) => {
      source.getAnimeEditorScheduleBoard.mockImplementation((animeId: string) => (animeId === 'anime-1' ? first.promise : Promise.resolve(boardAnswer('anime-2', 'Martes'))));
    });
    expect(result.current.scheduleWeek.status).toBe('loading');

    act(() => result.current.onSelectAnime('anime-2'));
    await waitFor(() => expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']));
    await act(async () => late(first));

    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']);
  });

  it('places the anime on the week from the board the schedule editor opened with', async () => {
    const { result, source } = await loadHook();
    await waitFor(() => expect(result.current.scheduleWeek.status).toBe('ready'));
    source.getAnimeEditorScheduleBoard.mockResolvedValueOnce(boardAnswer('anime-1', 'Martes'));

    await act(() => result.current.onOpenSchedule());

    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']);
  });

  it('ignores the board read of the schedule editor when a newer anime read settled first', async () => {
    const { result, source } = await loadHook();
    await waitFor(() => expect(result.current.scheduleWeek.status).toBe('ready'));
    const opening = deferred();
    source.getAnimeEditorScheduleBoard.mockImplementation((animeId: string) => (animeId === 'anime-1' ? opening.promise : Promise.resolve(boardAnswer('anime-2', 'Martes'))));

    let open: Promise<void> | undefined;
    act(() => { open = result.current.onOpenSchedule(); });
    act(() => result.current.onSelectAnime('anime-2'));
    await waitFor(() => expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']));
    await act(async () => {
      opening.resolve(boardAnswer('anime-1', 'Lunes'));
      await open;
    });

    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']);
  });

  it('reads the board of the anime selected now, after an anime save', async () => {
    const { result, source } = await loadHook();
    act(() => result.current.onSelectAnime('anime-2'));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-2'));
    source.saveAnimeEditor.mockResolvedValueOnce({ outcome: 'applied', message: 'saved', modifiedAt: 101, record: record('anime-2') });
    act(() => result.current.onDraftChange('name', 'Renamed'));

    await act(() => result.current.onSave());

    expect(source.getAnimeEditorScheduleBoard).toHaveBeenLastCalledWith('anime-2');
  });

  it('does not read the board or the list again when the anime save fails', async () => {
    const { result, source } = await loadHook();
    await waitFor(() => expect(result.current.scheduleWeek.status).toBe('ready'));
    source.saveAnimeEditor.mockResolvedValueOnce({ outcome: 'conflict', message: 'stale', modifiedAt: 0 });
    act(() => result.current.onDraftChange('name', 'Renamed'));

    await act(() => result.current.onSave());

    expect(source.getAnimeEditorScheduleBoard).toHaveBeenCalledTimes(1);
    expect(source.getAnimes).toHaveBeenCalledTimes(1);
  });
});

describe('useAnimeEditorWorkspace Schedule card', () => {
  it('reads the board as soon as the anime is selected and places it on the week', async () => {
    const { result, source } = await loadHook();

    await waitFor(() => expect(result.current.scheduleWeek.status).toBe('ready'));
    expect(source.getAnimeEditorScheduleBoard).toHaveBeenCalledWith('anime-1');
    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: 2 of 2', 'Martes: not scheduled']);
    expect(result.current.isScheduleModalOpen).toBe(false);
  });

  it('reads the board again after an anime save', async () => {
    const { result, source } = await loadHook();
    await waitFor(() => expect(result.current.scheduleWeek.status).toBe('ready'));
    act(() => result.current.onDraftChange('name', 'Renamed'));

    await act(() => result.current.onSave());

    expect(source.getAnimeEditorScheduleBoard).toHaveBeenCalledTimes(2);
  });

  it('follows the applied board, which carries no origin, for the selected anime', async () => {
    const { result, source } = await loadHook();
    await act(() => result.current.onOpenSchedule());
    vi.mocked(source.applyAnimeEditorSchedule).mockResolvedValueOnce({
      outcome: 'applied', message: 'applied', modifiedAt: 101,
      board: { ...board(101), originAnimeId: '', entries: [{ ...board().entries[1]!, placements: [{ day: 'Martes', order: 1 }] }] },
    });

    await act(() => result.current.onApplySchedule([]));

    expect(result.current.scheduleWeek.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: 1 of 1']);
  });

  it('shows a failed board read in the card', async () => {
    const { result, source } = await loadHook();
    vi.mocked(source.getAnimeEditorScheduleBoard).mockRejectedValueOnce(new Error('offline'));

    act(() => result.current.onSelectAnime('anime-2'));

    await waitFor(() => expect(result.current.scheduleWeek).toEqual({ status: 'failed', days: [], seasonDays: [], failureMessage: 'offline' }));
  });

  it('still opens the schedule editor right away when nothing is unsaved', async () => {
    const { result } = await loadHook();

    await act(() => result.current.onOpenSchedule());

    expect(result.current.isGuardOpen).toBe(false);
    expect(result.current.isScheduleModalOpen).toBe(true);
  });
});

describe('useAnimeEditorWorkspace independent cards', () => {
  it('reads the Episodes card for the saved folder, not for an unsaved folder in the anime draft', async () => {
    const { result, episodeSource } = await loadHook();

    act(() => result.current.onDraftChange('folder', 'D:/Anime/Typed'));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(episodeSource.getEpisodeDurationSection).toHaveBeenCalledTimes(1);
    expect(episodeSource.getEpisodeDurationSection).toHaveBeenCalledWith(expect.objectContaining({ folder: 'D:/Anime/Frieren' }));
  });

  it('reads the Episodes card again from the new saved record after an anime save changes the folder', async () => {
    const { result, episodeSource } = await loadHook();
    act(() => result.current.onDraftChange('folder', 'D:/Anime/Moved'));

    await act(() => result.current.onSave());

    await waitFor(() => expect(episodeSource.getEpisodeDurationSection).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'D:/Anime/Moved' })));
  });

  it('keeps the anime save free of episodes and leaves the Episodes draft alone', async () => {
    const { result, source, episodeSource } = await loadHook();
    addEpisode(result);
    act(() => result.current.onDraftChange('name', 'Renamed'));

    await act(() => result.current.onSave());

    expect(source.saveAnimeEditor.mock.calls[0]?.[0]).not.toHaveProperty('episodes');
    expect(episodeSource.saveEpisodeDurations).not.toHaveBeenCalled();
    expect(result.current.isRecordDirty).toBe(false);
    expect(result.current.episodes.isDirty).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('guards a switch while only the Episodes card is dirty, and Discard changes drops both drafts', async () => {
    const { result } = await loadHook();
    addEpisode(result);
    act(() => result.current.onDraftChange('name', 'Renamed'));
    expect(result.current.isRecordDirty).toBe(true);

    act(() => result.current.onSelectAnime('anime-2'));
    expect(result.current.isGuardOpen).toBe(true);
    await act(() => result.current.onDiscardAndContinue());

    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-2'));
    expect(result.current.isDirty).toBe(false);
  });

  it('Discard changes on the schedule guard drops both drafts and opens the editor', async () => {
    const { result } = await loadHook();
    addEpisode(result);
    act(() => result.current.onDraftChange('name', 'Renamed'));
    await act(() => result.current.onOpenSchedule());

    await act(() => result.current.onDiscardAndContinue());

    expect(result.current.isRecordDirty).toBe(false);
    expect(result.current.episodes.isDirty).toBe(false);
    expect(result.current.draft.name).toBe('anime-1');
    expect(result.current.isScheduleModalOpen).toBe(true);
  });

  it('guards opening the schedule while only the Episodes card is dirty', async () => {
    const { result } = await loadHook();
    addEpisode(result);
    expect(result.current.isRecordDirty).toBe(false);

    await act(() => result.current.onOpenSchedule());

    expect(result.current.isGuardOpen).toBe(true);
    expect(result.current.isScheduleModalOpen).toBe(false);
  });

  it('Save and continue saves each dirty card on its own, then continues', async () => {
    const { result, source, episodeSource } = await loadHook();
    addEpisode(result);
    act(() => result.current.onDraftChange('name', 'Renamed'));
    act(() => result.current.onSelectAnime('anime-2'));

    await act(() => result.current.onSaveAndContinue());

    expect(source.saveAnimeEditor).toHaveBeenCalledTimes(1);
    expect(episodeSource.saveEpisodeDurations).toHaveBeenCalledWith('anime-1', [{ episode: 1, durationMs: 24 * 60_000, source: 'manual', clear: false }]);
    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-2'));
  });

  it('Save and continue saves only the dirty Episodes card, and stays with its error when that save fails', async () => {
    const episodeSource = createEmptyEpisodeDurationSource();
    vi.mocked(episodeSource.saveEpisodeDurations).mockResolvedValueOnce({ outcome: 'error', message: 'disk full', changed: 0 });
    const { result, source } = await loadHook(episodeSource);
    addEpisode(result);
    act(() => result.current.onSelectAnime('anime-2'));

    await act(() => result.current.onSaveAndContinue());

    expect(source.saveAnimeEditor).not.toHaveBeenCalled();
    expect(result.current.selectedAnimeId).toBe('anime-1');
    expect(result.current.isGuardOpen).toBe(true);
    expect(result.current.episodes.saveError).toBe('disk full');
    expect(result.current.episodes.isDirty).toBe(true);
  });

  it('blocks Save and continue while a re-analysis runs, and saves nothing', async () => {
    const episodeSource = createEmptyEpisodeDurationSource();
    const analysis = deferred<Awaited<ReturnType<EpisodeDurationRuntimeSource['reanalyzeEpisodeDurations']>>>();
    vi.mocked(episodeSource.reanalyzeEpisodeDurations).mockReturnValueOnce(analysis.promise);
    const { result, source } = await loadHook(episodeSource);
    addEpisode(result);
    act(() => void result.current.episodes.onReanalyze());
    act(() => result.current.onSelectAnime('anime-2'));

    expect(result.current.isGuardSaveBlocked).toBe(true);
    await act(() => result.current.onSaveAndContinue());

    expect(episodeSource.saveEpisodeDurations).not.toHaveBeenCalled();
    expect(source.saveAnimeEditor).not.toHaveBeenCalled();
    expect(result.current.selectedAnimeId).toBe('anime-1');
    await act(async () => analysis.resolve({ outcome: 'ok', status: 'no_folder', filesRecognized: 0, rows: [] }));
    expect(result.current.isGuardSaveBlocked).toBe(false);
  });

  it('Save and continue stays when the anime save fails, even after the Episodes card saved', async () => {
    const { result, source, episodeSource } = await loadHook();
    vi.mocked(source.saveAnimeEditor).mockResolvedValueOnce({ outcome: 'conflict', message: 'stale', modifiedAt: 0 });
    addEpisode(result);
    act(() => result.current.onDraftChange('name', 'Renamed'));
    act(() => result.current.onSelectAnime('anime-2'));

    await act(() => result.current.onSaveAndContinue());

    expect(episodeSource.saveEpisodeDurations).toHaveBeenCalledTimes(1);
    expect(result.current.selectedAnimeId).toBe('anime-1');
    expect(result.current.isGuardOpen).toBe(true);
    expect(result.current.feedback).toBe('stale');
  });
});
