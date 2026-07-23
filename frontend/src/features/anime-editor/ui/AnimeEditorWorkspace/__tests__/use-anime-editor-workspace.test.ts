import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRecord, AnimeEditorSaveResult } from '../../../../../shared/contracts/anime.types';
import { useAnimeEditorWorkspace } from '../use-anime-editor-workspace';

const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => createElement(MemoryRouter, undefined, children);

function record(animeId: string, name = animeId, modifiedAt = 100): AnimeEditorRecord {
  return {
    animeId,
    modifiedAt,
    frequent: {
      name,
      status: 0,
      progress: 12,
      totalEpisodes: 28,
      active: true,
      kind: 1,
      page: '',
      folder: '',
      placements: [],
    },
    details: { genres: [], studios: { kind: 'missing', values: [] } },
  };
}

function mutation(outcome: AnimeEditorSaveResult['outcome'], authority?: AnimeEditorRecord): AnimeEditorSaveResult {
  return {
    animeId: authority?.animeId,
    message: `${outcome} message`,
    modifiedAt: authority?.modifiedAt ?? 0,
    outcome,
    record: authority,
  };
}

function createSource() {
  return {
    getAnimes: vi.fn().mockResolvedValue([
      { id: 'anime-1', nombre: 'Frieren', estado: 0, nrocapvisto: 12, activo: 1, dias: [], generos: [], hasDownloadPage: true, hasFolder: true },
      { id: 'anime-2', nombre: 'Apothecary Diaries', estado: 1, nrocapvisto: 24, activo: 1, dias: [], generos: [], hasDownloadPage: true, hasFolder: true },
    ]),
    getAnimeEditorRecord: vi.fn().mockImplementation(async (animeId: string) => ({ outcome: 'applied', message: 'loaded', record: record(animeId, animeId === 'anime-1' ? 'Frieren' : 'Apothecary Diaries') })),
    saveAnimeEditor: vi.fn().mockResolvedValue(mutation('applied', record('anime-1', 'Saved', 101))),
    deactivateAnime: vi.fn().mockResolvedValue(mutation('applied', record('anime-1', 'Frieren', 101))),
    restoreAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', message: 'restored', modifiedAt: 101 }),
    getAnimeEditorScheduleBoard: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 100, destinations: [], entries: [] } }),
    applyAnimeEditorSchedule: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'applied', modifiedAt: 101, board: { originAnimeId: 'anime-1', boardModifiedAt: 101, destinations: [], entries: [] } }),
  };
}

async function loadHook(source = createSource()) {
  const rendered = renderHook(() => useAnimeEditorWorkspace({ initialAnimeId: 'anime-1' }, source as never), { wrapper });
  await waitFor(() => expect(rendered.result.current.selectedRecord?.animeId).toBe('anime-1'));
  return { ...rendered, source };
}

describe('useAnimeEditorWorkspace', () => {
  it('loads the requested deep-link anime', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({ initialAnimeId: 'anime-2' }, source as never), { wrapper });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-2'));
  });

  it('keeps the attempted draft and refreshed authority separate after conflict', async () => {
    const { result, source } = await loadHook();
    vi.mocked(source.saveAnimeEditor).mockResolvedValueOnce(mutation('conflict', record('anime-1', 'Authority', 200)));
    act(() => result.current.onDraftChange('name', 'Attempted'));
    await act(() => result.current.onSave());
    expect(result.current.draft.name).toBe('Attempted');
    expect(result.current.selectedRecord?.frequent.name).toBe('Authority');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.feedback).toBe('conflict message');
  });

  it.each(['applied', 'no_op'] as const)('clears dirty after an intentional %s save', async (outcome) => {
    const { result, source } = await loadHook();
    vi.mocked(source.saveAnimeEditor).mockResolvedValueOnce(mutation(outcome, record('anime-1', 'Attempted', 101)));
    act(() => result.current.onDraftChange('name', 'Attempted'));
    await act(() => result.current.onSave());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.selectedAnimeId).toBe('anime-1');
  });

  it('retains dirty state and resets loading when save throws', async () => {
    const { result, source } = await loadHook();
    vi.mocked(source.saveAnimeEditor).mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.onDraftChange('name', 'Attempted'));
    await act(() => result.current.onSave());
    expect(result.current.draft.name).toBe('Attempted');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.feedback).toBe('offline');
  });

  it('shows invalid feedback without calling the save binding', async () => {
    const { result, source } = await loadHook();
    act(() => result.current.onDraftChange('name', '   '));
    await act(() => result.current.onSave());
    expect(source.saveAnimeEditor).not.toHaveBeenCalled();
    expect(result.current.feedback).toBe('Name is required.');
    expect(result.current.isDirty).toBe(true);
  });

  it('save-and-continue completes selection only from the returned successful outcome', async () => {
    const { result, source } = await loadHook();
    act(() => result.current.onDraftChange('name', 'Attempted'));
    act(() => result.current.onSelectAnime('anime-2'));
    vi.mocked(source.saveAnimeEditor).mockResolvedValueOnce(mutation('applied', record('anime-1', 'Attempted', 101)));
    await act(() => result.current.onSaveAndContinue());
    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-2'));
  });

  it.each(['conflict', 'error'] as const)('save-and-continue stays on the current anime after %s', async (outcome) => {
    const { result, source } = await loadHook();
    act(() => result.current.onDraftChange('name', 'Attempted'));
    act(() => result.current.onSelectAnime('anime-2'));
    vi.mocked(source.saveAnimeEditor).mockResolvedValueOnce(mutation(outcome, record('anime-1', 'Authority', 200)));
    await act(() => result.current.onSaveAndContinue());
    expect(result.current.selectedAnimeId).toBe('anime-1');
    expect(result.current.isGuardOpen).toBe(true);
  });

  it('guards selection, schedule entry, app links, browser back, and reload while dirty', async () => {
    const { result } = await loadHook();
    act(() => result.current.onDraftChange('name', 'Attempted'));

    act(() => result.current.onSelectAnime('anime-2'));
    expect(result.current.isGuardOpen).toBe(true);
    act(() => result.current.onStayWithCurrentEditor());

    await act(() => result.current.onOpenSchedule());
    expect(result.current.isGuardOpen).toBe(true);
    act(() => result.current.onStayWithCurrentEditor());

    const link = document.createElement('a');
    link.href = '/catalog';
    document.body.append(link);
    act(() => fireEvent.click(link));
    expect(result.current.isGuardOpen).toBe(true);
    act(() => result.current.onStayWithCurrentEditor());

    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.isGuardOpen).toBe(true);

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    act(() => window.dispatchEvent(beforeUnload));
    expect(beforeUnload.defaultPrevented).toBe(true);
    link.remove();
  });

  it('discard-and-continue abandons the draft and completes the pending selection', async () => {
    const { result } = await loadHook();
    act(() => result.current.onDraftChange('name', 'Attempted'));
    act(() => result.current.onSelectAnime('anime-2'));
    await act(() => result.current.onDiscardAndContinue());
    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-2'));
  });

  it('ignores a stale record response that resolves after the current selection', async () => {
    const source = createSource();
    let resolveFirst: ((value: ReturnType<typeof mutation>) => void) | undefined;
    vi.mocked(source.getAnimeEditorRecord)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ outcome: 'applied', message: 'loaded', record: record('anime-2', 'Newest') });
    const { result } = renderHook(() => useAnimeEditorWorkspace({ initialAnimeId: 'anime-1' }, source as never), { wrapper });
    await waitFor(() => expect(source.getAnimeEditorRecord).toHaveBeenCalledWith('anime-1'));
    act(() => result.current.onSelectAnime('anime-2'));
    await waitFor(() => expect(result.current.selectedRecord?.frequent.name).toBe('Newest'));
    await act(async () => resolveFirst?.({ outcome: 'applied', message: 'loaded', modifiedAt: 100, record: record('anime-1', 'Stale') }));
    expect(result.current.selectedRecord?.frequent.name).toBe('Newest');
    expect(result.current.isLoadingRecord).toBe(false);
  });

  it('reloads authoritative schedule board returned by a conflict', async () => {
    const { result, source } = await loadHook();
    await act(() => result.current.onOpenSchedule());
    vi.mocked(source.applyAnimeEditorSchedule).mockResolvedValueOnce({
      outcome: 'conflict', message: 'board changed', modifiedAt: 200,
      board: { originAnimeId: 'anime-1', boardModifiedAt: 200, destinations: [], entries: [] },
    });
    await act(() => result.current.onApplySchedule([]));
    expect(result.current.scheduleBoard?.boardModifiedAt).toBe(200);
    expect(result.current.scheduleFeedback).toBe('board changed');
    expect(result.current.isApplyingSchedule).toBe(false);
  });

  it('clears schedule feedback after a successful apply so the warning alert stays hidden', async () => {
    const { result, source } = await loadHook();
    await act(() => result.current.onOpenSchedule());
    vi.mocked(source.applyAnimeEditorSchedule)
      .mockResolvedValueOnce({
        outcome: 'conflict', message: 'board changed', modifiedAt: 200,
        board: { originAnimeId: 'anime-1', boardModifiedAt: 200, destinations: [], entries: [] },
      })
      .mockResolvedValueOnce({
        outcome: 'applied', message: 'apply_schedule applied', modifiedAt: 201,
        board: { originAnimeId: 'anime-1', boardModifiedAt: 201, destinations: [], entries: [] },
      });

    await act(() => result.current.onApplySchedule([]));
    expect(result.current.scheduleFeedback).toBe('board changed');

    await act(() => result.current.onApplySchedule([]));

    expect(result.current.scheduleBoard?.boardModifiedAt).toBe(201);
    expect(result.current.scheduleFeedback).toBeUndefined();
    expect(result.current.isApplyingSchedule).toBe(false);
  });
});
