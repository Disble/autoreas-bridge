import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useAnimeDetailMutation } from '../use-anime-detail-mutation';

const detail: AnimeDetail = {
  _id: 'anime-1',
  nombre: 'Frieren',
  estado: 1,
  nrocapvisto: 12,
  activo: 0,
  primeravez: 1,
  dias: [],
  generos: [],
  modified_at: 0,
};

function createSource(): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn().mockResolvedValue({ ...detail, modified_at: 11 }),
    getAnimeHistory: vi.fn(),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 }),
    restoreAnime: vi.fn(),
  };
}

describe('useAnimeDetailMutation', () => {
  it('confirms with the exact zero base and returns the refreshed Detail', async () => {
    const source = createSource();
    const setDetailSnapshot = vi.fn();
    const { result } = renderHook(() => useAnimeDetailMutation({
      animeId: 'anime-1',
      detailSnapshot: { animeId: 'anime-1', detail },
      source,
      setDetailSnapshot,
    }));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(source.repeatAnime).toHaveBeenCalledWith('anime-1', 0);
    expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1');
    expect(setDetailSnapshot).toHaveBeenCalledWith({
      animeId: 'anime-1',
      detail: expect.objectContaining({ modified_at: 11 }),
    });
    expect(result.current.feedback?.title).toBe('Repeat applied');
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
    const setDetailSnapshot = vi.fn();
    const animeTwoDetail = { ...detail, _id: 'anime-2', nombre: 'Dungeon Meshi' };
    const { result, rerender } = renderHook(
      ({ animeId, currentDetail }: { animeId: string; currentDetail: AnimeDetail }) => (
        useAnimeDetailMutation({
          animeId,
          detailSnapshot: { animeId, detail: currentDetail },
          source,
          setDetailSnapshot,
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
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
    expect(setDetailSnapshot).not.toHaveBeenCalled();

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
      const staleSetDetailSnapshot = vi.fn();
      const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
        <StrictMode>{children}</StrictMode>
      );
      const staleHook = renderHook(() => useAnimeDetailMutation({
        animeId: 'anime-1',
        detailSnapshot: { animeId: 'anime-1', detail },
        source,
        setDetailSnapshot: staleSetDetailSnapshot,
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

      const freshSetDetailSnapshot = vi.fn();
      const freshHook = renderHook(() => useAnimeDetailMutation({
        animeId: 'anime-1',
        detailSnapshot: { animeId: 'anime-1', detail },
        source,
        setDetailSnapshot: freshSetDetailSnapshot,
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

      expect(source.getAnimeDetail).not.toHaveBeenCalled();
      expect(staleSetDetailSnapshot).not.toHaveBeenCalled();
      expect(freshSetDetailSnapshot).not.toHaveBeenCalled();
      expect(staleHook.result.current).toBe(stateAtUnmount);
      expect(staleHook.result.current.feedback).toBeUndefined();
      expect(staleHook.result.current.confirmation?.action).toBe('repeat');
      expect(freshHook.result.current.feedback).toBeUndefined();
      expect(freshHook.result.current.confirmation?.action).toBe('repeat');

      await act(async () => freshHook.result.current.onConfirmAction());

      expect(repeatAnime).toHaveBeenCalledTimes(2);
      expect(source.getAnimeDetail).toHaveBeenCalledTimes(1);
      expect(freshSetDetailSnapshot).toHaveBeenCalledTimes(1);
      expect(freshHook.result.current.feedback?.title).toBe('Repeat applied');
    },
  );
});
