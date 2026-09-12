import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { useAnimeEditorWorkspace } from '../use-anime-editor-workspace';

/**
 * Builds one rail-list anime fixture.
 * @param id The anime id.
 * @param name Display name.
 * @returns The fixture, cast to satisfy the untyped list source.
 */
function makeAnime(id: string, name: string) {
  return { id, name, status: 0, active: 1, episodesWatched: 1, days: [] } as unknown as never;
}

/**
 * Builds one authoritative editor record fixture.
 * @param id The anime id.
 * @returns The record.
 */
function makeRecord(id: string) {
  return {
    animeId: id,
    modifiedAt: 1,
    frequent: { name: `Name ${id}`, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
    details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, premieredAt: null, cover: null },
  };
}

/**
 * Builds the editor's data source with every call this suite needs stubbed.
 * @returns The stubbed source.
 */
function createSource(): AnimeEditorRuntimeSource {
  return {
    getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta'), makeAnime('anime-3', 'Gamma')]),
    getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id) })),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    restoreAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
  } as unknown as AnimeEditorRuntimeSource;
}

/** Router context the hook needs, since it reads and writes navigation state. */
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('anime editor selection is not locked after the first pick', () => {
  it('changes the loaded record on each consecutive selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source), { wrapper });

    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    act(() => result.current.onSelectAnime('anime-2'));
    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-2'));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-2'));

    act(() => result.current.onSelectAnime('anime-3'));
    await waitFor(() => expect(result.current.selectedAnimeId).toBe('anime-3'));
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-3'));
  });
});

describe('deactivate confirmation flow', () => {
  it('opens confirmation, runs deactivate only on confirm, then closes', async () => {
    const source = createSource();
    (source.deactivateAnime as ReturnType<typeof vi.fn>).mockResolvedValue({ outcome: 'applied', record: undefined });
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source), { wrapper });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('deactivate'));
    expect(result.current.lifecycleConfirmation?.action).toBe('deactivate');
    expect(source.deactivateAnime).not.toHaveBeenCalled();

    await act(async () => { await result.current.onConfirmLifecycleAction(); });
    expect(source.deactivateAnime).toHaveBeenCalledTimes(1);
    expect(result.current.lifecycleConfirmation).toBeUndefined();
  });

  it('closes without deactivating when cancelled', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source), { wrapper });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    act(() => result.current.onRequestLifecycleAction('deactivate'));
    act(() => result.current.onCancelLifecycleAction());

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    expect(source.deactivateAnime).not.toHaveBeenCalled();
  });
});

describe('restore confirmation flow', () => {
  it('opens confirmation, runs restore (not deactivate) only on confirm, then closes', async () => {
    const source = createSource();
    (source.restoreAnime as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source), { wrapper });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('restore'));
    expect(result.current.lifecycleConfirmation?.action).toBe('restore');
    expect(source.restoreAnime).not.toHaveBeenCalled();

    await act(async () => { await result.current.onConfirmLifecycleAction(); });
    expect(source.restoreAnime).toHaveBeenCalledTimes(1);
    expect(source.deactivateAnime).not.toHaveBeenCalled();
    expect(result.current.lifecycleConfirmation).toBeUndefined();
  });
});
