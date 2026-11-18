import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BridgeQueryProvider } from '../../../../../shared/query/BridgeQueryProvider/BridgeQueryProvider';
import { BRIDGE_INVALIDATIONS } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { createBridgeQueryClient } from '../../../../../shared/query/query-client/query-client.helpers';
import { createReadinessGate } from '../../../../../shared/query/readiness-gate/readiness-gate.helpers';
import { fakeSource, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { EpisodeSchedulePanel } from '../EpisodeSchedulePanel';
import type { EpisodeScheduleSource } from '../episode-schedule-panel.types';
import { makeSeason } from '../../../../../shared/season/__tests__/season.test-support';
import { getDefaultEpisodeDay } from '../episode-schedule-panel.helpers';
import { createEpisodesWrapper, createSource, scheduleItem } from './episode-schedule.test-support';

afterEach(() => {
  cleanup();
});

/**
 * Mounts Today on a router under the given query wrapper.
 * @param source The schedule source.
 * @param wrapper The query wrapper (client + readiness gate).
 * @param props The day Today opens on; without one, season mode chooses it.
 */
function renderToday(source: EpisodeScheduleSource, wrapper: (props: { readonly children: ReactNode }) => ReactNode, props: Readonly<{ initialDay?: string }> = { initialDay: 'Viernes' }) {
  return render(
    <MemoryRouter>
      <EpisodeSchedulePanel {...props} source={source} />
    </MemoryRouter>,
    { wrapper },
  );
}

/** The loading region Today shows while its schedule is unresolved. */
const loadingStatus = () => screen.queryByRole('status', { name: 'Loading the schedule...' });

/** The empty state's one action, present only when the day resolved empty. */
const emptyStateAction = () => screen.queryByRole('button', { name: 'Create an anime' });

/** The failure Alert's title. */
const failureAlert = () => screen.queryByText('Episode schedule unavailable');

describe('Today while the episodes module starts, is ready, or failed (S9)', () => {
  it('shows the skeleton and never the empty state while the episodes module starts, then the schedule once it is ready', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });
    const { wrapper, emit } = createEpisodesWrapper(status('episodes', 'starting'));

    renderToday(source, wrapper);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(loadingStatus()).toBeInTheDocument();
    expect(screen.getAllByTestId('episode-schedule-skeleton-row')).toHaveLength(3);
    expect(emptyStateAction()).toBeNull();
    expect(screen.queryByText(/Nothing scheduled/)).toBeNull();
    expect(failureAlert()).toBeNull();

    act(() => emit(status('episodes', 'ready')));

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
  });

  it('shows the rows and nothing else once ready with anime scheduled', async () => {
    const source = createSource({ getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });

    renderToday(source, createEpisodesWrapper().wrapper);

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
    expect(emptyStateAction()).toBeNull();
    expect(failureAlert()).toBeNull();
  });

  it('shows the empty state only once ready with nothing scheduled', async () => {
    renderToday(createSource(), createEpisodesWrapper().wrapper);

    expect(await screen.findByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
    expect(failureAlert()).toBeNull();
  });

  it('shows the failure Alert with the module reason, and no empty state, once the episodes module failed', async () => {
    const source = createSource();

    renderToday(source, createEpisodesWrapper(status('episodes', 'failed', 'episodes: db closed')).wrapper);

    expect(await screen.findByText('Episode schedule unavailable')).toBeInTheDocument();
    expect(screen.getByText('episodes: db closed')).toBeInTheDocument();
    expect(emptyStateAction()).toBeNull();
    expect(loadingStatus()).toBeNull();
    expect(source.getEpisodeSchedule).not.toHaveBeenCalled();
  });
});

describe('Today initial lens while the season module starts, is ready, or failed (D2)', () => {
  it('shows the skeleton without reading the schedule while the season module starts, then opens on Ver hoy once a season is open', async () => {
    const source = createSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });
    const { wrapper, emit } = createEpisodesWrapper(status('episodes', 'ready'), status('season', 'starting'));

    renderToday(source, wrapper, {});
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(loadingStatus()).toBeInTheDocument();
    expect(emptyStateAction()).toBeNull();
    expect(failureAlert()).toBeNull();
    expect(source.readSeason).not.toHaveBeenCalled();
    expect(source.getEpisodeSchedule).not.toHaveBeenCalled();

    act(() => emit(status('season', 'ready')));

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(source.getEpisodeSchedule).toHaveBeenCalledWith('Ver hoy');
    expect(source.getEpisodeSchedule).toHaveBeenCalledTimes(1);
  });

  it('falls back to the daily lens, never waiting on season, once the season module failed', async () => {
    const source = createSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });

    renderToday(source, createEpisodesWrapper(status('episodes', 'ready'), status('season', 'failed', 'season: db closed')).wrapper, {});

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(source.readSeason).not.toHaveBeenCalled();
    expect(source.getEpisodeSchedule).toHaveBeenCalledWith(getDefaultEpisodeDay());
    expect(failureAlert()).toBeNull();
  });
});

describe('Today under the app query runtime', () => {
  /**
   * The real provider with the app's invalidation rules, a readiness gate over
   * `readiness`, and a fake backend event source.
   * @param readiness The readiness source the gate reads.
   * @returns The wrapper and `emit` (fires one backend event).
   */
  function appRuntime(readiness: ReturnType<typeof fakeSource>['source']) {
    const listeners = new Map<string, () => void>();
    const eventSource = {
      subscribe: (eventName: string, listener: () => void) => {
        listeners.set(eventName, listener);
        return () => listeners.delete(eventName);
      },
    };
    const client = createBridgeQueryClient();
    const readinessGate = createReadinessGate(readiness);
    /** Provides the app's query runtime to the tree under test. */
    function AppRuntime({ children }: { readonly children: ReactNode }) {
      return (
        <BridgeQueryProvider client={client} eventSource={eventSource} invalidations={BRIDGE_INVALIDATIONS} readinessGate={readinessGate}>
          {children}
        </BridgeQueryProvider>
      );
    }
    return { wrapper: AppRuntime, emit: (eventName: string) => listeners.get(eventName)?.() };
  }

  it('shows a row another writer added when the backend emits anime.changed', async () => {
    const readiness = fakeSource();
    const getEpisodeSchedule = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]);
    const runtime = appRuntime(readiness.source);

    renderToday(createSource({ getEpisodeSchedule }), runtime.wrapper);
    await act(() => readiness.answer(status('episodes', 'ready')));
    expect(await screen.findByRole('button', { name: 'Create an anime' })).toBeInTheDocument();

    act(() => runtime.emit('anime.changed'));

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(emptyStateAction()).toBeNull();
  });

  it('recovers when the first readiness snapshot failed and the ready event was dropped', async () => {
    const readiness = fakeSource();
    const source = createSource({ getEpisodeSchedule: vi.fn().mockResolvedValue([scheduleItem('anime-1', { animeName: 'Frieren' })]) });

    renderToday(source, appRuntime(readiness.source).wrapper);
    await act(() => readiness.fail(createBridgeError('internal', 'registry gone')));
    expect(await screen.findByText('Episode schedule unavailable')).toBeInTheDocument();

    // No `bridge.readiness` event arrives: only the snapshot retry (after 1 s) can settle the module.
    await waitFor(() => expect(readiness.calls.filter((call) => call === 'getReadiness')).toHaveLength(2), { timeout: 3000 });
    await act(() => readiness.answer(status('episodes', 'ready')));

    expect(await screen.findByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(failureAlert()).toBeNull();
  });
});
