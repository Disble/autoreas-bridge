import { act, renderHook } from '@testing-library/react';
import { waitFor } from './wait-for.test-support';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { PickerSource } from '../../../../../shared/contracts/picker.types';
import type { AnimeCoverPreviewSource, AnimeSource } from '../../../../../shared/contracts/anime-source.types';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { EpisodeCommandsSource } from '../../../../../shared/contracts/episodes.types';
import type { UseAnimeEditorTransitionsOptions } from '../anime-editor-workspace.types';
import { useAnimeEditorTransitions } from '../use-anime-editor-transitions';
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

/** One fake serving the shell pickers, the anime module's Editor and cover ports and the episodes module's restore and repeat. */
type FakeEditorSources = PickerSource & AnimeEditorSource & Pick<AnimeSource, 'getAnimeCover'> & AnimeCoverPreviewSource & Pick<EpisodeCommandsSource, 'restoreAnime' | 'repeatAnime'>;

/**
 * Builds the editor's data sources with every call this suite needs stubbed:
 * the shell pickers, the anime module's Editor and cover ports and the episodes
 * module's restore and repeat on one object, passed as the workspace's picker,
 * Editor and cover sources, and served as the episodes port.
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
    pickFile: vi.fn().mockResolvedValue(''),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    previewAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
  } as unknown as FakeEditorSources;
  episodesPort.current = source;
  return source;
}

/** Router context the hook needs, since it reads and writes navigation state. */
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('anime editor selection is not locked after the first pick', () => {
  it('changes the loaded record on each consecutive selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source, source), { wrapper: createEpisodesReadyWrapper(wrapper) });

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
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('deactivate'));
    expect(result.current.lifecycleConfirmation?.action).toBe('deactivate');
    expect(source.deactivateAnime).not.toHaveBeenCalled();

    await act(async () => { await result.current.onConfirmLifecycleAction(); });
    expect(source.deactivateAnime).toHaveBeenCalledTimes(1);
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(source.repeatAnime).not.toHaveBeenCalled();
    expect(result.current.lifecycleConfirmation).toBeUndefined();
  });

  it('closes without deactivating when cancelled, and a later confirm runs nothing', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    act(() => result.current.onRequestLifecycleAction('deactivate'));
    act(() => result.current.onCancelLifecycleAction());

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    await act(async () => { await result.current.onConfirmLifecycleAction(); });
    expect(source.deactivateAnime).not.toHaveBeenCalled();
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(source.repeatAnime).not.toHaveBeenCalled();
  });
});

describe('restore confirmation flow', () => {
  it('opens confirmation, runs restore (not deactivate) only on confirm, then closes', async () => {
    const source = createSource();
    (source.restoreAnime as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('restore'));
    expect(result.current.lifecycleConfirmation?.action).toBe('restore');
    expect(source.restoreAnime).not.toHaveBeenCalled();

    await act(async () => { await result.current.onConfirmLifecycleAction(); });
    expect(source.restoreAnime).toHaveBeenCalledTimes(1);
    expect(source.deactivateAnime).not.toHaveBeenCalled();
    expect(source.repeatAnime).not.toHaveBeenCalled();
    expect(result.current.lifecycleConfirmation).toBeUndefined();
  });
});

describe('repeat confirmation flow', () => {
  it('opens confirmation, runs repeat (not restore) only on confirm, then reloads the rail', async () => {
    const source = createSource();
    (source.repeatAnime as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useAnimeEditorWorkspace({}, source, episodeSource, source, source), { wrapper: createEpisodesReadyWrapper(wrapper) });
    await waitFor(() => expect(result.current.selectedRecord?.animeId).toBe('anime-1'));

    expect(result.current.lifecycleConfirmation).toBeUndefined();
    act(() => result.current.onRequestLifecycleAction('repeat'));
    expect(result.current.lifecycleConfirmation?.action).toBe('repeat');
    expect(source.repeatAnime).not.toHaveBeenCalled();

    const getAnimesCallsBeforeConfirm = (source.getAnimes as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { await result.current.onConfirmLifecycleAction(); });

    expect(source.repeatAnime).toHaveBeenCalledTimes(1);
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(source.deactivateAnime).not.toHaveBeenCalled();
    expect(result.current.lifecycleConfirmation).toBeUndefined();
    // Design D11 corollary at the transitions layer: a successful repeat
    // reloads the rail (loadItems -> getAnimes), mirroring onRestore's wrapper.
    expect((source.getAnimes as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(getAnimesCallsBeforeConfirm);
  });
});

/**
 * Options with every command resolved to nothing and both cards clean.
 * @param overrides The options a test drives.
 * @returns The options.
 */
function options(overrides: Partial<UseAnimeEditorTransitionsOptions> = {}): UseAnimeEditorTransitionsOptions {
  return {
    selectedAnimeId: 'anime-1',
    loadItems: vi.fn(() => Promise.resolve()),
    setSelectedAnimeId: vi.fn(),
    loadRecord: vi.fn(() => Promise.resolve()),
    saveRecord: vi.fn(() => Promise.resolve(undefined)),
    deactivateRecord: vi.fn(() => Promise.resolve(undefined)),
    restoreRecord: vi.fn(() => Promise.resolve(undefined)),
    repeatRecord: vi.fn(() => Promise.resolve(undefined)),
    discardRecord: vi.fn(),
    discardEpisodes: vi.fn(),
    applySchedule: vi.fn(() => Promise.resolve(undefined)),
    openSchedule: vi.fn(() => Promise.resolve()),
    reloadSchedule: vi.fn(() => Promise.resolve()),
    saveEpisodes: vi.fn(() => Promise.resolve(undefined)),
    isDirty: false,
    isRecordDirty: false,
    isEpisodesDirty: false,
    isGuardSaveBlocked: false,
    ...overrides,
  };
}

/**
 * Renders the hook on the editor routes, with the router's navigate exposed.
 * @param initial The options of the first render.
 * @param path The route the hook starts on.
 * @returns The rendered hook, whose result also carries `navigate`.
 */
function renderTransitions(initial: UseAnimeEditorTransitionsOptions, path = '/editor/anime-1') {
  /** The editor routes the workspace mounts on. */
  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={children} path="/editor" />
          <Route element={children} path="/editor/:id" />
        </Routes>
      </MemoryRouter>
    );
  }
  return renderHook(({ current }) => ({ ...useAnimeEditorTransitions(current), navigate: useNavigate() }), { initialProps: { current: initial }, wrapper });
}

describe('useAnimeEditorTransitions', () => {
  it('refreshes the rail after a deactivation only when the command took effect', async () => {
    const deactivateRecord = vi.fn<UseAnimeEditorTransitionsOptions['deactivateRecord']>()
      .mockResolvedValueOnce({ outcome: 'applied' } as never)
      .mockResolvedValueOnce({ outcome: 'error' } as never)
      .mockResolvedValueOnce(undefined);
    const current = options({ deactivateRecord });
    const { result } = renderTransitions(current);

    await act(() => result.current.onDeactivate());
    expect(current.loadItems).toHaveBeenCalledTimes(1);
    await act(() => result.current.onDeactivate());
    await act(() => result.current.onDeactivate());
    expect(current.loadItems).toHaveBeenCalledTimes(1);
  });

  it.each(['onRestore', 'onRepeat'] as const)('refreshes the rail after %s only when the command answered "ok"', async (command) => {
    const run = vi.fn(() => Promise.resolve<{ readonly status: string } | undefined>({ status: 'ok' }));
    const current = options({ restoreRecord: run, repeatRecord: run });
    const { result } = renderTransitions(current);

    await act(() => result.current[command]());
    expect(current.loadItems).toHaveBeenCalledTimes(1);
    run.mockResolvedValueOnce({ status: 'error' }).mockResolvedValueOnce(undefined);
    await act(() => result.current[command]());
    await act(() => result.current[command]());
    expect(current.loadItems).toHaveBeenCalledTimes(1);
  });

  it('reloads the rail and the selected record after an applied schedule, and only the rail with no selection', async () => {
    const applySchedule = vi.fn(() => Promise.resolve({ outcome: 'applied' } as never));
    const selected = options({ applySchedule });
    const { result, rerender } = renderTransitions(selected);

    await act(() => result.current.onApplySchedule([]));
    expect(selected.loadItems).toHaveBeenCalledTimes(1);
    expect(selected.loadRecord).toHaveBeenCalledExactlyOnceWith('anime-1');

    const unselected = options({ applySchedule, selectedAnimeId: undefined });
    rerender({ current: unselected });
    await act(() => result.current.onApplySchedule([]));
    expect(unselected.loadItems).toHaveBeenCalledTimes(1);
    expect(unselected.loadRecord).not.toHaveBeenCalled();
  });

  it('ignores a pick of the anime already selected, and selects another one', async () => {
    const current = options();
    const { result } = renderTransitions(current);

    act(() => result.current.onSelectAnime('anime-1'));
    expect(current.setSelectedAnimeId).not.toHaveBeenCalled();
    await act(async () => result.current.onSelectAnime('anime-2'));
    // The fake setter never moves `selectedAnimeId`, so the route effect may confirm the pick again.
    expect(current.setSelectedAnimeId).toHaveBeenLastCalledWith('anime-2');
    expect(current.setSelectedAnimeId).not.toHaveBeenCalledWith('anime-1');
  });

  it('follows a new route id, holds it behind the guard while dirty, and ignores a route without an id', async () => {
    const clean = options();
    const { result, rerender } = renderTransitions(clean);

    await act(() => result.current.navigate('/editor/anime-2'));
    expect(clean.setSelectedAnimeId).toHaveBeenCalledExactlyOnceWith('anime-2');

    await act(() => result.current.navigate('/editor'));
    expect(clean.setSelectedAnimeId).toHaveBeenCalledTimes(1);

    const dirty = options({ isDirty: true });
    rerender({ current: dirty });
    await act(() => result.current.navigate('/editor/anime-3'));
    expect(dirty.setSelectedAnimeId).not.toHaveBeenCalled();
    expect(result.current.isGuardOpen).toBe(true);
  });
});
