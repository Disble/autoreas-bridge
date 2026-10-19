import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { UseAnimeEditorTransitionsOptions } from '../anime-editor-workspace.types';
import { useAnimeEditorTransitions } from '../use-anime-editor-transitions';

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
