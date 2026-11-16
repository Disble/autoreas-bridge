import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { EpisodeCommandsSource } from '../../../../../shared/contracts/episodes.types';
import { useAnimeEditorWorkspace } from '../use-anime-editor-workspace';
import { createEmptyEpisodeDurationSource, createEpisodesReadyWrapper } from './episode-duration-source.test-support';

/** Holds the current test's stub, which also serves the episodes module's restore and repeat. */
const episodesPort = vi.hoisted(() => ({ current: {} as unknown }));

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The lifecycle hook's restore and repeat port: the current test's stub. */
  get BRIDGE_EPISODES_SOURCE() {
    return episodesPort.current;
  },
}));

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

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
    details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, cover: null },
  };
}

/** One fake serving the runtime pickers, the anime module's Editor port and the episodes module's restore and repeat. */
type FakeEditorSources = AnimeEditorRuntimeSource & AnimeEditorSource & Pick<EpisodeCommandsSource, 'restoreAnime' | 'repeatAnime'>;

/**
 * Builds the editor's data sources with every call this suite needs stubbed:
 * the runtime pickers, the anime module's Editor port and the episodes module's
 * restore and repeat on one object, passed as the workspace's `source` and its
 * `editorSource`, and served as the episodes port.
 * @returns The stubbed sources.
 */
function createSource(): FakeEditorSources {
  const source = {
    getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta'), makeAnime('anime-3', 'Gamma')]),
    getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id) })),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    restoreAnime: vi.fn(),
    repeatAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
  } as unknown as FakeEditorSources;
  episodesPort.current = source;
  return source;
}

/** Router context the hook needs, since it reads and writes navigation state. */
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('anime editor selection is not locked after the first pick', () => {
  it('changes the loaded record on each consecutive selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source), { wrapper: createEpisodesReadyWrapper(wrapper) });

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
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
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
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
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
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
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

describe('repeat confirmation flow', () => {
  it('opens confirmation, runs repeat (not restore) only on confirm, then reloads the rail', async () => {
    const source = createSource();
    (source.repeatAnime as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('repeat'));
    expect(result.current.lifecycleConfirmation?.action).toBe('repeat');
    expect(source.repeatAnime).not.toHaveBeenCalled();

    const getAnimesCallsBeforeConfirm = (source.getAnimes as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { await result.current.onConfirmLifecycleAction(); });

    expect(source.repeatAnime).toHaveBeenCalledTimes(1);
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(result.current.lifecycleConfirmation).toBeUndefined();
    // Design D11 corollary at the transitions layer: a successful repeat
    // reloads the rail (loadItems -> getAnimes), mirroring onRestore's wrapper.
    expect((source.getAnimes as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(getAnimesCallsBeforeConfirm);
  });
});
