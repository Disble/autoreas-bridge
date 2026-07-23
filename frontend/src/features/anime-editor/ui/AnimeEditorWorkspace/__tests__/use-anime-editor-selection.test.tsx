import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { useAnimeEditorWorkspace } from '../use-anime-editor-workspace';

function makeAnime(id: string, name: string) {
  return { id, name, status: 0, active: 1, episodesWatched: 1, days: [] } as unknown as never;
}

function makeRecord(id: string) {
  return {
    animeId: id,
    modifiedAt: 1,
    frequent: { name: `Name ${id}`, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
    details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, premieredAt: null, cover: null },
  };
}

function createSource(): AnimeEditorRuntimeSource {
  return {
    getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta'), makeAnime('anime-3', 'Gamma')]),
    getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id) })),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
  } as unknown as AnimeEditorRuntimeSource;
}

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

    expect(result.current.isDeactivateConfirmOpen).toBe(false);
    act(() => result.current.onRequestDeactivate());
    expect(result.current.isDeactivateConfirmOpen).toBe(true);
    expect(source.deactivateAnime).not.toHaveBeenCalled();

    await act(async () => { await result.current.onConfirmDeactivate(); });
    expect(source.deactivateAnime).toHaveBeenCalledTimes(1);
    expect(result.current.isDeactivateConfirmOpen).toBe(false);
  });

  it('closes without deactivating when cancelled', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source), { wrapper });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    act(() => result.current.onRequestDeactivate());
    act(() => result.current.onCancelDeactivate());

    expect(result.current.isDeactivateConfirmOpen).toBe(false);
    expect(source.deactivateAnime).not.toHaveBeenCalled();
  });
});
