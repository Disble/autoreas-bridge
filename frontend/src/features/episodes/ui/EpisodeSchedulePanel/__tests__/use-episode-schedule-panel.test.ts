import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEpisodeSchedulePanel } from '../use-episode-schedule-panel';
import { getDefaultEpisodeDay } from '../episode-schedule-panel.helpers';
import type { EpisodeScheduleSource } from '../episode-schedule-panel.types';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  danger: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

function createSource(overrides: Partial<EpisodeScheduleSource> = {}): EpisodeScheduleSource {
  return {
    adjustWatchedEpisodes: vi.fn(),
    copyAnimeFolder: vi.fn(),
    copyAnimePage: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    getEpisodeDayCounts: vi.fn().mockResolvedValue([]),
    getSeasonMode: vi.fn().mockResolvedValue(false),
    getEpisodeSchedule: vi.fn().mockResolvedValue([]),
    openAnimeFolder: vi.fn(),
    openAnimePage: vi.fn(),
    setAnimeState: vi.fn(),
    subscribeAnimeChanges: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useEpisodeSchedulePanel', () => {
  it('loads the selected day schedule through the injected source', async () => {
    const source = createSource({
      getEpisodeSchedule: vi.fn().mockResolvedValue([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          status: 0,
          folderPath: '',
          hasCover: false,
          modified_at: 1000,
          episodesWatched: 10,
          pageUrl: 'https://example.com',
          totalEpisodes: 28,
        },
      ]),
    });

    const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(source.getEpisodeSchedule).toHaveBeenCalledWith('Viernes');
    expect(result.current.rows[0]?.name).toBe('Frieren');
  });

  it('starts on Ver hoy when season mode is enabled', async () => {
    const source = createSource({
      getEpisodeSchedule: vi.fn().mockResolvedValue([]),
      getSeasonMode: vi.fn().mockResolvedValue(true),
    });

    const { result } = renderHook(() => useEpisodeSchedulePanel({ source }));

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenLastCalledWith('Ver hoy'));
    expect(result.current.filterOptions).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
  });

  it('initializes the view lens from the global season mode preference', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    const { result } = renderHook(() => useEpisodeSchedulePanel({ source }));

    await waitFor(() => expect(result.current.lens).toBe('season'));
  });

  it('overrides the episode lens to daily without mutating the global season mode', async () => {
    const getSeasonMode = vi.fn().mockResolvedValue(true);
    const source = createSource({ getSeasonMode });
    const { result } = renderHook(() => useEpisodeSchedulePanel({ source }));

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    act(() => result.current.selectLens('daily'));

    await waitFor(() => expect(result.current.lens).toBe('daily'));
    expect(result.current.filterOptions).toContain('Sábado');
    expect(result.current.selectedDay).toBe(getDefaultEpisodeDay());
    expect(getSeasonMode).toHaveBeenCalledTimes(1);
  });

  it('switches back to the season lens and reopens on Ver hoy', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });
    const { result } = renderHook(() => useEpisodeSchedulePanel({ source }));
    await waitFor(() => expect(result.current.lens).toBe('season'));

    act(() => result.current.selectLens('daily'));
    await waitFor(() => expect(result.current.lens).toBe('daily'));
    act(() => result.current.selectLens('season'));

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    expect(result.current.filterOptions).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
  });

  it('delegates episode adjustments with the row modified_at base and refreshes', async () => {
    const getEpisodeSchedule = vi
      .fn()
      .mockResolvedValueOnce([
        {
          animeId: 'anime-1',
          animeName: 'Frieren',
          day: 'Viernes',
          dayOrder: 1,
          status: 0,
          folderPath: '',
          hasCover: false,
          modified_at: 1000,
          episodesWatched: 10,
          pageUrl: 'https://example.com',
          totalEpisodes: 28,
        },
      ])
      .mockResolvedValueOnce([]);
    const adjustWatchedEpisodes = vi.fn().mockResolvedValue({ status: 'ok' });
    const source = createSource({ adjustWatchedEpisodes, getEpisodeSchedule });

    const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.adjustWatchedEpisodes('anime-1', 0.5, 1000);
    });

    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    expect(getEpisodeSchedule).toHaveBeenCalledTimes(2);
  });

  it('delegates desktop page and folder actions', async () => {
    const source = createSource({
      copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
      openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
      openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

    await act(async () => {
      await result.current.openAnimePage('anime-1');
      await result.current.copyAnimeFolder('anime-1');
    });

    expect(source.openAnimePage).toHaveBeenCalledWith('anime-1');
    expect(source.copyAnimeFolder).toHaveBeenCalledWith('anime-1');
  });

  describe('copy feedback toasts', () => {
    beforeEach(() => {
      toastMock.success.mockClear();
    });

    it('confirms a successful folder copy with a toast', async () => {
      const source = createSource({ copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }) });
      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await act(async () => {
        await result.current.copyAnimeFolder('anime-1');
      });

      expect(toastMock.success).toHaveBeenCalledWith('Folder path copied to clipboard');
    });

    it('confirms a successful page copy with a toast', async () => {
      const source = createSource({ copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }) });
      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await act(async () => {
        await result.current.copyAnimePage('anime-1');
      });

      expect(toastMock.success).toHaveBeenCalledWith('Page URL copied to clipboard');
    });

    it('does not toast when the copy fails and keeps the error message', async () => {
      const source = createSource({ copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'error', message: 'clipboard unavailable' }) });
      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await act(async () => {
        await result.current.copyAnimeFolder('anime-1');
      });

      expect(toastMock.success).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toBe('clipboard unavailable');
    });

    it('does not toast on open actions', async () => {
      const source = createSource({ openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }) });
      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await act(async () => {
        await result.current.openAnimeFolder('anime-1');
      });

      expect(toastMock.success).not.toHaveBeenCalled();
    });
  });

  describe('cover fetching', () => {
    function scheduleItem(animeId: string, hasCover: boolean) {
      return {
        animeId,
        animeName: animeId,
        day: 'Viernes',
        dayOrder: 1,
        status: 0,
        folderPath: '',
        hasCover,
        modified_at: 1000,
        episodesWatched: 1,
        pageUrl: '',
      };
    }

    it('fetches the cover once per distinct animeID with hasCover, and never for hasCover:false rows', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,abc', source: 'cover' });
      const source = createSource({
        getAnimeCover,
        getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true), scheduleItem('anime-2', false)]),
      });

      const { result, rerender } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(2));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      expect(getAnimeCover).toHaveBeenCalledWith('anime-1');

      rerender();
      rerender();

      await waitFor(() => expect(result.current.rows[0]?.coverDataUrl).toBe('data:image/png;base64,abc'));
      expect(getAnimeCover).toHaveBeenCalledTimes(1);
      expect(result.current.rows[1]?.showCoverPlaceholder).toBe(true);
    });

    it('resolves a rejected cover fetch to a placeholder entry instead of leaving it loading forever', async () => {
      const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
      const source = createSource({
        getAnimeCover,
        getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true)]),
      });

      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.rows[0]?.showCoverPlaceholder).toBe(true));
    });

    it('resolves a placeholder-source cover response to a placeholder entry', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
      const source = createSource({
        getAnimeCover,
        getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', true)]),
      });

      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      expect(result.current.rows[0]?.showCoverPlaceholder).toBe(true);
    });
  });

  describe('day counts', () => {
    it('fetches day counts once on mount but not again after a plain day selection change', async () => {
      const getEpisodeDayCounts = vi.fn().mockResolvedValue([{ count: 2, day: 'Viernes' }]);
      const source = createSource({ getEpisodeDayCounts });

      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1));

      act(() => {
        result.current.selectDay('Sábado');
      });

      await waitFor(() => expect(result.current.selectedDay).toBe('Sábado'));
      expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1);
    });

    it('re-fetches day counts after a successful setAnimeState call', async () => {
      const getEpisodeDayCounts = vi.fn().mockResolvedValue([]);
      const setAnimeState = vi.fn().mockResolvedValue({ status: 'ok' });
      const source = createSource({
        getEpisodeDayCounts,
        getEpisodeSchedule: vi.fn().mockResolvedValue([]),
        setAnimeState,
      });

      const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.setAnimeState('anime-1', 1, 1000);
      });

      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(2));
    });
  });
  describe('push reactivity', () => {
    it('re-fetches the schedule and day counts when an external anime change is pushed', async () => {
      let pushAnimeChanged: (() => void) | undefined;
      const getEpisodeSchedule = vi.fn().mockResolvedValue([]);
      const getEpisodeDayCounts = vi.fn().mockResolvedValue([]);
      const source = createSource({
        getEpisodeDayCounts,
        getEpisodeSchedule,
        subscribeAnimeChanges: vi.fn().mockImplementation((listener: () => void) => {
          pushAnimeChanged = listener;
          return () => undefined;
        }),
      });

      renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getEpisodeSchedule).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1));

      act(() => {
        pushAnimeChanged?.();
      });

      await waitFor(() => expect(getEpisodeSchedule).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(2));
    });

    it('releases the push subscription on unmount so a later event does not refetch', async () => {
      let pushAnimeChanged: (() => void) | undefined;
      const unsubscribe = vi.fn();
      const getEpisodeSchedule = vi.fn().mockResolvedValue([]);
      const source = createSource({
        getEpisodeSchedule,
        subscribeAnimeChanges: vi.fn().mockImplementation((listener: () => void) => {
          pushAnimeChanged = listener;
          return () => {
            pushAnimeChanged = undefined;
            unsubscribe();
          };
        }),
      });

      const { unmount } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }));

      await waitFor(() => expect(getEpisodeSchedule).toHaveBeenCalledTimes(1));

      unmount();

      expect(unsubscribe).toHaveBeenCalled();

      act(() => {
        pushAnimeChanged?.();
      });

      expect(getEpisodeSchedule).toHaveBeenCalledTimes(1);
    });
  });
});
