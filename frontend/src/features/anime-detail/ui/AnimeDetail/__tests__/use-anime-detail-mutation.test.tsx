import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import type { AnimeDetailCommandSource } from '../anime-detail.types';
import { useAnimeDetailMutation } from '../use-anime-detail-mutation';

/** A minimal populated anime detail fixture shared across this file's cases. */
const detail: AnimeDetail = {
  id: 'anime-1',
  name: 'Frieren',
  status: 1,
  episodesWatched: 12,
  active: 0,
  firstCycle: 1,
  days: [],
  genres: [],
  modified_at: 0,
};

/** Builds the commands `useAnimeDetailMutation` runs. */
function createSource(): AnimeDetailCommandSource {
  return {
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 }),
    restoreAnime: vi.fn(),
  };
}

describe('useAnimeDetailMutation', () => {
  it('confirms with the exact zero base and returns the refreshed Detail', async () => {
    const source = createSource();
    const refreshDetail = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAnimeDetailMutation({
      animeId: 'anime-1',
      detail,
      commands: source,
      refreshDetail,
    }));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(source.repeatAnime).toHaveBeenCalledWith('anime-1', 0);
    expect(refreshDetail).toHaveBeenCalledTimes(1);
    expect(result.current.feedback).toMatchObject({ title: 'Repeat applied', status: 'success' });
  });

  it('warns that the Detail could not be refreshed when the read after the mutation fails', async () => {
    const refreshDetail = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useAnimeDetailMutation({
      animeId: 'anime-1',
      detail,
      commands: createSource(),
      refreshDetail,
    }));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(refreshDetail).toHaveBeenCalledTimes(1);
    expect(result.current.feedback?.status).toBe('warning');
    expect(result.current.feedback?.description).toMatch(/Anime Detail could not be refreshed\.$/);
  });

  it.each([
    ['the episodes module reason', createBridgeError('unavailable', 'episodes: module is starting'), 'episodes: module is starting'],
    ['the generic message for an uncoded failure', new Error('boom'), 'Runtime request failed.'],
  ])('reports a rejected command with %s, without refreshing the Detail', async (_label, failure, description) => {
    const commands = { repeatAnime: vi.fn().mockRejectedValue(failure), restoreAnime: vi.fn().mockRejectedValue(failure) };
    const refreshDetail = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useAnimeDetailMutation({ animeId: 'anime-1', detail, commands, refreshDetail }));

    act(() => result.current.onRequestRestore());
    await act(async () => result.current.onConfirmAction());

    expect(commands.restoreAnime).toHaveBeenCalledWith('anime-1', 0);
    expect(refreshDetail).not.toHaveBeenCalled();
    expect(result.current.feedback).toEqual({ status: 'danger', title: 'Restore failed', description });
  });

  it('invalidates pending state and stale completion across route visits', async () => {
    let resolveFirstMutation: ((value: {
      status: string;
      outcome: string;
      modifiedAt: number;
    }) => void) | undefined;
    const firstMutation = new Promise<{
      status: string;
      outcome: string;
      modifiedAt: number;
    }>((resolve) => {
      resolveFirstMutation = resolve;
    });
    const repeatAnime = vi.fn()
      .mockReturnValueOnce(firstMutation)
      .mockResolvedValueOnce({ status: 'ok', outcome: 'applied', modifiedAt: 21 });
    const source = { ...createSource(), repeatAnime };
    const refreshDetail = vi.fn().mockResolvedValue(true);
    const animeTwoDetail = { ...detail, id: 'anime-2', name: 'Dungeon Meshi' };
    const { result, rerender } = renderHook(
      ({ animeId, currentDetail }: { animeId: string; currentDetail: AnimeDetail }) => (
        useAnimeDetailMutation({
          animeId,
          detail: currentDetail,
          commands: source,
          refreshDetail,
        })
      ),
      { initialProps: { animeId: 'anime-1', currentDetail: detail } },
    );

    act(() => result.current.onRequestRepeat());
    let staleCompletion: Promise<void> | undefined;
    act(() => {
      staleCompletion = result.current.onConfirmAction();
    });
    expect(result.current.isMutating).toBe(true);
    expect(result.current.confirmation?.action).toBe('repeat');

    rerender({ animeId: 'anime-2', currentDetail: animeTwoDetail });
    expect(result.current.isMutating).toBe(false);
    expect(result.current.confirmation).toBeUndefined();

    rerender({ animeId: 'anime-1', currentDetail: detail });
    expect(result.current.isMutating).toBe(false);
    expect(result.current.confirmation).toBeUndefined();

    await act(async () => {
      resolveFirstMutation?.({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
      await staleCompletion;
    });

    expect(result.current.feedback).toBeUndefined();
    expect(refreshDetail).not.toHaveBeenCalled();

    act(() => result.current.onRequestRepeat());
    expect(result.current.confirmation?.action).toBe('repeat');
    await act(async () => result.current.onConfirmAction());

    await waitFor(() => expect(result.current.isMutating).toBe(false));
    expect(repeatAnime).toHaveBeenCalledTimes(2);
    expect(result.current.feedback?.title).toBe('Repeat applied');
  });

  it.each(['resolve', 'reject'] as const)(
    'invalidates a pending mutation when its unmounted visit later %ss',
    async (settlement) => {
      let resolveMutation: ((value: {
        status: string;
        outcome: string;
        modifiedAt: number;
      }) => void) | undefined;
      let rejectMutation: ((reason: Error) => void) | undefined;
      const pendingMutation = new Promise<{
        status: string;
        outcome: string;
        modifiedAt: number;
      }>((resolve, reject) => {
        resolveMutation = resolve;
        rejectMutation = reject;
      });
      const repeatAnime = vi.fn()
        .mockReturnValueOnce(pendingMutation)
        .mockResolvedValueOnce({ status: 'ok', outcome: 'applied', modifiedAt: 21 });
      const source = { ...createSource(), repeatAnime };
      const staleRefreshDetail = vi.fn().mockResolvedValue(true);
      const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
        <StrictMode>{children}</StrictMode>
      );
      const staleHook = renderHook(() => useAnimeDetailMutation({
        animeId: 'anime-1',
        detail,
        commands: source,
        refreshDetail: staleRefreshDetail,
      }), { wrapper });

      act(() => staleHook.result.current.onRequestRepeat());
      let staleCompletion: Promise<void> | undefined;
      act(() => {
        staleCompletion = staleHook.result.current.onConfirmAction();
      });
      const stateAtUnmount = staleHook.result.current;
      expect(stateAtUnmount.isMutating).toBe(true);
      expect(stateAtUnmount.confirmation?.action).toBe('repeat');
      staleHook.unmount();

      const freshRefreshDetail = vi.fn().mockResolvedValue(true);
      const freshHook = renderHook(() => useAnimeDetailMutation({
        animeId: 'anime-1',
        detail,
        commands: source,
        refreshDetail: freshRefreshDetail,
      }), { wrapper });
      act(() => freshHook.result.current.onRequestRepeat());

      await act(async () => {
        if (settlement === 'resolve') {
          resolveMutation?.({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
        } else {
          rejectMutation?.(new Error('mutation unavailable'));
        }
        await staleCompletion;
      });

      expect(staleRefreshDetail).not.toHaveBeenCalled();
      expect(freshRefreshDetail).not.toHaveBeenCalled();
      expect(staleHook.result.current).toBe(stateAtUnmount);
      expect(staleHook.result.current.feedback).toBeUndefined();
      expect(staleHook.result.current.confirmation?.action).toBe('repeat');
      expect(freshHook.result.current.feedback).toBeUndefined();
      expect(freshHook.result.current.confirmation?.action).toBe('repeat');

      await act(async () => freshHook.result.current.onConfirmAction());

      expect(repeatAnime).toHaveBeenCalledTimes(2);
      expect(staleRefreshDetail).not.toHaveBeenCalled();
      expect(freshRefreshDetail).toHaveBeenCalledTimes(1);
      expect(freshHook.result.current.feedback?.title).toBe('Repeat applied');
    },
  );
});
