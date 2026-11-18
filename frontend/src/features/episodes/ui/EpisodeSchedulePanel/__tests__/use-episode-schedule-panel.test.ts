import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_INVALIDATIONS } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { connectInvalidationBridge } from '../../../../../shared/query/invalidation-bridge/invalidation-bridge.helpers';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useEpisodeSchedulePanel } from '../use-episode-schedule-panel';
import { getDefaultEpisodeDay } from '../episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from '../episode-schedule-panel.types';
import { makeSeason } from '../../../../../shared/season/__tests__/season.test-support';
import { SEASON_CURRENT_KEY } from '../../../../../shared/season/season.constants';
import { createEpisodesWrapper, createSource, scheduleItem } from './episode-schedule.test-support';

/** Toast stub, hoisted so the HeroUI module mock can close over it. */
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  danger: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

/**
 * Renders the hook under a query wrapper whose episodes module is ready.
 * @param props The panel props.
 * @returns The hook result and the wrapper's client.
 */
function renderPanelHook(props: Readonly<EpisodeSchedulePanelProps>) {
  const { client, wrapper } = createEpisodesWrapper();
  return { ...renderHook(() => useEpisodeSchedulePanel(props), { wrapper }), client };
}

/**
 * The rows the schedule view renders, or none outside the ready state.
 * @param current The hook's current result.
 * @returns The rows.
 */
function rowsOf(current: ReturnType<typeof useEpisodeSchedulePanel>) {
  return current.scheduleView.kind === 'ready' ? current.scheduleView.data : [];
}

/**
 * Connects the app's real invalidation rules to a fake backend event source.
 * @param client The client the hook renders with.
 * @returns `emit` (fires one backend event) and `disconnect`.
 */
function connectEvents(client: ReturnType<typeof renderPanelHook>['client']) {
  const listeners = new Map<string, () => void>();
  const disconnect = connectInvalidationBridge(client, BRIDGE_INVALIDATIONS, {
    subscribe: (eventName, listener) => {
      listeners.set(eventName, listener);
      return () => listeners.delete(eventName);
    },
  });
  return { emit: (eventName: string) => listeners.get(eventName)?.(), disconnect };
}

describe('useEpisodeSchedulePanel', () => {
  it('loads the selected day schedule through the injected source', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });

    const { result } = renderPanelHook({ initialDay: 'Viernes', source });

    await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));
    expect(source.getEpisodeSchedule).toHaveBeenCalledWith('Viernes');
    expect(rowsOf(result.current)[0]?.name).toBe('Frieren');
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('starts on the current weekday when no season is open', async () => {
    const source = createSource({ readSeason: vi.fn().mockResolvedValue(null) });
    const { result } = renderPanelHook({ source });

    await waitFor(() => expect(result.current.selectedDay).toBe(getDefaultEpisodeDay()));
    expect(result.current.lens).toBe('daily');
    expect(source.getEpisodeSchedule).toHaveBeenCalledWith(getDefaultEpisodeDay());
  });

  it('starts on Ver hoy when season mode is enabled', async () => {
    const source = createSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });

    const { result } = renderPanelHook({ source });

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenLastCalledWith('Ver hoy'));
    expect(result.current.filterOptions).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
  });

  it('initializes the view lens from the global season mode preference', async () => {
    const { result } = renderPanelHook({ source: createSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) }) });

    await waitFor(() => expect(result.current.lens).toBe('season'));
  });

  it('overrides the episode lens to daily without mutating the global season mode', async () => {
    const readSeason = vi.fn().mockResolvedValue(makeSeason());
    const { result } = renderPanelHook({ source: createSource({ readSeason }) });

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    act(() => result.current.selectLens('daily'));

    await waitFor(() => expect(result.current.lens).toBe('daily'));
    expect(result.current.filterOptions).toContain('Sábado');
    expect(result.current.selectedDay).toBe(getDefaultEpisodeDay());
    expect(readSeason).toHaveBeenCalledTimes(1);
  });

  it('keeps a lens the user picked while the season read was pending, through later season reads', async () => {
    let resolveSeason: (season: ReturnType<typeof makeSeason>) => void = () => undefined;
    const readSeason = vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveSeason = resolve; })).mockResolvedValue(null);
    const { result, client } = renderPanelHook({ source: createSource({ readSeason }) });

    act(() => result.current.selectLens('daily'));
    await act(async () => resolveSeason(makeSeason()));
    await waitFor(() => expect(result.current.filterOptions).toContain('Sábado'));
    expect(result.current.lens).toBe('daily');
    await act(async () => client.invalidateQueries({ queryKey: SEASON_CURRENT_KEY }));

    await waitFor(() => expect(readSeason).toHaveBeenCalledTimes(2));
    expect(result.current.lens).toBe('daily');
    expect(result.current.selectedDay).toBe(getDefaultEpisodeDay());
  });

  it('switches back to the season lens and reopens on Ver hoy', async () => {
    const { result } = renderPanelHook({ source: createSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) }) });
    await waitFor(() => expect(result.current.lens).toBe('season'));

    act(() => result.current.selectLens('daily'));
    await waitFor(() => expect(result.current.lens).toBe('daily'));
    act(() => result.current.selectLens('season'));

    await waitFor(() => expect(result.current.selectedDay).toBe('Ver hoy'));
    expect(result.current.filterOptions).toEqual(['Sin ver', 'Visto', 'Ver hoy']);
  });

  it('delegates episode adjustments with the row modified_at base and refreshes', async () => {
    const getEpisodeSchedule = vi.fn().mockResolvedValueOnce([scheduleItem('anime-1')]).mockResolvedValueOnce([]);
    const adjustWatchedEpisodes = vi.fn().mockResolvedValue({ status: 'ok' });
    const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource({ adjustWatchedEpisodes, getEpisodeSchedule }) });
    await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));

    await act(async () => {
      await result.current.adjustWatchedEpisodes('anime-1', 0.5, 1000);
    });

    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    await waitFor(() => expect(getEpisodeSchedule).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));
  });

  it.each([
    ['adjustWatchedEpisodes', (api: ReturnType<typeof useEpisodeSchedulePanel>) => api.adjustWatchedEpisodes('anime-1', 1, 1000), 'Could not update episode progress.'],
    ['setAnimeState', (api: ReturnType<typeof useEpisodeSchedulePanel>) => api.setAnimeState('anime-1', 1, 1000), 'Could not update anime state.'],
  ] as const)('shows a rejected %s as the failure, its message or the fallback, and re-reads nothing', async (port, run, fallback) => {
    const command = vi.fn().mockRejectedValueOnce(createBridgeError('unavailable', 'episodes is starting')).mockRejectedValueOnce(createBridgeError('internal', ''));
    const source = createSource({ [port]: command });
    const { result } = renderPanelHook({ initialDay: 'Viernes', source });
    await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));

    await act(async () => {
      await run(result.current);
    });
    expect(result.current.scheduleView).toMatchObject({ kind: 'failure', message: 'episodes is starting' });
    await act(async () => {
      await run(result.current);
    });

    expect(result.current.scheduleView).toMatchObject({ kind: 'failure', message: fallback });
    expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(1);
    expect(source.getEpisodeDayCounts).toHaveBeenCalledTimes(1);
  });

  it('delegates desktop page and folder actions', async () => {
    const source = createSource();
    const { result } = renderPanelHook({ initialDay: 'Viernes', source });

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
      const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource() });

      await act(async () => {
        await result.current.copyAnimeFolder('anime-1');
      });

      expect(toastMock.success).toHaveBeenCalledWith('Folder path copied to clipboard');
    });

    it('confirms a successful page copy with a toast', async () => {
      const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource() });

      await act(async () => {
        await result.current.copyAnimePage('anime-1');
      });

      expect(toastMock.success).toHaveBeenCalledWith('Page URL copied to clipboard');
    });

    it.each([
      ['answers an error status', () => Promise.resolve({ status: 'error', message: 'clipboard unavailable' })],
      ['rejects with a BridgeError', () => Promise.reject(createBridgeError('internal', 'clipboard unavailable'))],
    ])('does not toast when the copy %s and shows its message as the failure', async (_label, copyAnimeFolder) => {
      const source = createSource({ copyAnimeFolder: vi.fn(copyAnimeFolder) });
      const { result } = renderPanelHook({ initialDay: 'Viernes', source });
      await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));

      await act(async () => {
        await result.current.copyAnimeFolder('anime-1');
      });

      expect(toastMock.success).not.toHaveBeenCalled();
      expect(result.current.scheduleView).toMatchObject({ kind: 'failure', message: 'clipboard unavailable' });
    });

    it('does not toast on open actions', async () => {
      const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource() });

      await act(async () => {
        await result.current.openAnimeFolder('anime-1');
      });

      expect(toastMock.success).not.toHaveBeenCalled();
    });
  });

  describe('cover fetching', () => {
    it('fetches the cover once per distinct animeID with hasCover, and never for hasCover:false rows', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,abc', source: 'cover' });
      const first = [scheduleItem('anime-1', { hasCover: true }), scheduleItem('anime-2')];
      const getEpisodeSchedule = vi.fn().mockResolvedValueOnce(first).mockResolvedValue([...first, scheduleItem('anime-3')]);
      const { result, rerender, client } = renderPanelHook({ initialDay: 'Viernes', source: createSource({ getAnimeCover, getEpisodeSchedule }) });

      await waitFor(() => expect(rowsOf(result.current)).toHaveLength(2));
      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      expect(getAnimeCover).toHaveBeenCalledWith('anime-1');

      rerender();
      rerender();

      await waitFor(() => expect(rowsOf(result.current)[0]?.coverDataUrl).toBe('data:image/png;base64,abc'));
      expect(getAnimeCover).toHaveBeenCalledTimes(1);
      expect(rowsOf(result.current)[1]?.showCoverPlaceholder).toBe(true);

      // A bare rerender cannot prove the once-per-id guard: the cover effect
      // depends on the rows, which a rerender does not change. A refetch that
      // answers a NEW list holding the already-fetched id re-enters the effect.
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['episodes'] });
      });

      await waitFor(() => expect(rowsOf(result.current)).toHaveLength(3));
      expect(getAnimeCover).toHaveBeenCalledTimes(1);
      expect(rowsOf(result.current)[0]?.coverDataUrl).toBe('data:image/png;base64,abc');
    });

    it('resolves a rejected cover fetch to a placeholder entry instead of leaving it loading forever', async () => {
      const getAnimeCover = vi.fn().mockRejectedValue(new Error('boom'));
      const source = createSource({ getAnimeCover, getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { hasCover: true })]) });
      const { result } = renderPanelHook({ initialDay: 'Viernes', source });

      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(rowsOf(result.current)[0]?.showCoverPlaceholder).toBe(true));
    });

    it('resolves a placeholder-source cover response to a placeholder entry', async () => {
      const getAnimeCover = vi.fn().mockResolvedValue({ source: 'placeholder' });
      const source = createSource({ getAnimeCover, getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { hasCover: true })]) });
      const { result } = renderPanelHook({ initialDay: 'Viernes', source });

      await waitFor(() => expect(getAnimeCover).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(rowsOf(result.current)[0]?.showCoverPlaceholder).toBe(true));
    });
  });

  describe('day counts', () => {
    it('fetches day counts once on mount but not again after a plain day selection change', async () => {
      const getEpisodeDayCounts = vi.fn().mockResolvedValue([{ count: 2, day: 'Viernes' }]);
      const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource({ getEpisodeDayCounts }) });

      await waitFor(() => expect(result.current.dayCounts).toEqual([{ count: 2, day: 'Viernes' }]));

      act(() => {
        result.current.selectDay('Sábado');
      });

      await waitFor(() => expect(result.current.selectedDay).toBe('Sábado'));
      expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1);
    });

    it('re-fetches day counts after a successful setAnimeState call', async () => {
      const getEpisodeDayCounts = vi.fn().mockResolvedValue([]);
      const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource({ getEpisodeDayCounts }) });

      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.setAnimeState('anime-1', 1, 1000);
      });

      await waitFor(() => expect(getEpisodeDayCounts).toHaveBeenCalledTimes(2));
    });

    it('badges nothing when the counts read failed, without failing the schedule', async () => {
      const source = createSource({ getEpisodeDayCounts: vi.fn().mockRejectedValue(new Error('boom')), getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1')]) });
      const { result } = renderPanelHook({ initialDay: 'Viernes', source });

      await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));
      expect(result.current.dayCounts).toEqual([]);
    });
  });

  describe('anime.changed invalidation', () => {
    it('re-fetches the schedule and day counts when the backend emits anime.changed', async () => {
      const source = createSource();
      const { client } = renderPanelHook({ initialDay: 'Viernes', source });
      const events = connectEvents(client);
      await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(source.getEpisodeDayCounts).toHaveBeenCalledTimes(1));

      act(() => events.emit('anime.changed'));

      await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(source.getEpisodeDayCounts).toHaveBeenCalledTimes(2));
      events.disconnect();
    });

    it('keeps the rows and reports refreshing while anime.changed refetches the day, and only then', async () => {
      let answerRefetch: (rows: unknown) => void = () => undefined;
      const getEpisodeSchedule = vi.fn().mockResolvedValueOnce([scheduleItem('anime-1')]).mockReturnValue(new Promise((resolve) => (answerRefetch = resolve)));
      const { result, client } = renderPanelHook({ initialDay: 'Viernes', source: createSource({ getEpisodeSchedule }) });
      const events = connectEvents(client);
      await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));
      expect(result.current.isScheduleRefreshing).toBe(false);

      act(() => events.emit('anime.changed'));

      await waitFor(() => expect(result.current.isScheduleRefreshing).toBe(true));
      expect(rowsOf(result.current)).toHaveLength(1);
      act(() => answerRefetch([scheduleItem('anime-1'), scheduleItem('anime-2')]));
      await waitFor(() => expect(rowsOf(result.current)).toHaveLength(2));
      expect(result.current.isScheduleRefreshing).toBe(false);
      events.disconnect();
    });

    it('never reports refreshing outside the ready state', async () => {
      const source = createSource({ getEpisodeSchedule: vi.fn().mockReturnValue(new Promise(() => undefined)) });
      const { result } = renderPanelHook({ initialDay: 'Viernes', source });

      await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenCalled());
      expect(result.current.scheduleView.kind).toBe('loading');
      expect(result.current.isScheduleRefreshing).toBe(false);
    });

    it('hides a write failure once anime.changed reloads the schedule', async () => {
      const source = createSource({ setAnimeState: vi.fn().mockRejectedValue(createBridgeError('internal', 'stale row')) });
      const { result, client } = renderPanelHook({ initialDay: 'Viernes', source });
      const events = connectEvents(client);
      await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));
      await act(async () => {
        await result.current.setAnimeState('anime-1', 1, 1000);
      });
      expect(result.current.scheduleView).toMatchObject({ kind: 'failure', message: 'stale row' });

      await new Promise((resolve) => setTimeout(resolve, 5));
      act(() => events.emit('anime.changed'));

      await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));
      events.disconnect();
    });

    it('does not re-fetch once the panel unmounted', async () => {
      const source = createSource();
      const { client, unmount } = renderPanelHook({ initialDay: 'Viernes', source });
      const events = connectEvents(client);
      await waitFor(() => expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(1));

      unmount();
      act(() => events.emit('anime.changed'));

      expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(1);
      events.disconnect();
    });
  });
});

describe('useEpisodeSchedulePanel request lifecycle', () => {
  it('reports loading until the first schedule request settles', () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderPanelHook({ initialDay: 'Viernes', source });

    expect(result.current.scheduleView).toEqual({ kind: 'loading' });
  });

  it('reports the failure a rejected schedule request carries', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockRejectedValue(new Error('binding missing')) });
    const { result } = renderPanelHook({ initialDay: 'Viernes', source });

    await waitFor(() => expect(result.current.scheduleView).toEqual({ kind: 'failure', code: 'internal', message: 'binding missing' }));
  });

  it('falls back to the daily selection so a failed season read still requests a schedule', async () => {
    const source = createSource({ readSeason: vi.fn().mockRejectedValue(createBridgeError('internal', 'season read failed')) });
    const { result } = renderPanelHook({ source });

    await waitFor(() => expect(result.current.selectedDay).toBe(getDefaultEpisodeDay()));
    await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));
    expect(source.getEpisodeSchedule).toHaveBeenCalledWith(getDefaultEpisodeDay());
  });

  it('names the selected weekday in the empty-state copy', async () => {
    const { result } = renderPanelHook({ initialDay: 'Viernes', source: createSource() });

    await waitFor(() => expect(result.current.scheduleView.kind).toBe('empty'));
    expect(result.current.emptyStateCopy.title).toBe('Nothing scheduled for Friday');
  });

  it('reports loading before the season read has chosen a day to request', async () => {
    const source = createSource({ readSeason: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderPanelHook({ source });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.selectedDay).toBe('');
    expect(source.getEpisodeSchedule).not.toHaveBeenCalled();
    expect(result.current.scheduleView).toEqual({ kind: 'loading' });
  });
});

describe('useEpisodeSchedulePanel episodes readiness', () => {
  it('stays loading without calling either read while the episodes module starts, then loads once it is ready', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1')]) });
    const { wrapper, emit } = createEpisodesWrapper(status('episodes', 'starting'));
    const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.scheduleView).toEqual({ kind: 'loading' });
    expect(source.getEpisodeSchedule).not.toHaveBeenCalled();
    expect(source.getEpisodeDayCounts).not.toHaveBeenCalled();

    act(() => emit(status('episodes', 'ready')));

    await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));
  });

  it('fails with the module reason, without calling the read, once the episodes module failed', async () => {
    const source = createSource();
    const { wrapper } = createEpisodesWrapper(status('episodes', 'failed', 'episodes: db closed'));
    const { result } = renderHook(() => useEpisodeSchedulePanel({ initialDay: 'Viernes', source }), { wrapper });

    await waitFor(() => expect(result.current.scheduleView).toEqual({ kind: 'failure', code: 'failed_precondition', message: 'episodes: db closed' }));
    expect(source.getEpisodeSchedule).not.toHaveBeenCalled();
  });
});
