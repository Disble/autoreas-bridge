import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectBridgeEvents, createModulesTestWrapper } from '../../query/test-support/bridge-modules.test-support';
import { status } from '../../query/test-support/readiness-source.test-support';
import { resetSeasonStore, setSeasonStoreState } from '../../store/season-store/season-store.helpers';
import { useDisplayedSeason } from '../use-displayed-season';
import { useDisplayedSeasonAnimes } from '../use-displayed-season-animes';
import { createSeasonDataSource, makeSeason, makeSeasonRow, seasonQueryWrapper } from './season.test-support';

describe('useDisplayedSeason', () => {
  afterEach(() => resetSeasonStore());

  it('reads the open season while no past season is viewed', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { result } = renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(result.current.data).toEqual(makeSeason()));
    expect(source.readPastSeason).not.toHaveBeenCalled();
  });

  it('reads the past season the store views', async () => {
    setSeasonStoreState({ viewSeasonId: 'old' });
    const source = createSeasonDataSource({ readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'old', status: 'closed' })) });
    const { result } = renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(result.current.data?.id).toBe('old'));
    expect(source.readPastSeason).toHaveBeenCalledExactlyOnceWith('old');
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('never fetches for a cache-only reader, which still sees what another reader loaded', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { wrapper } = seasonQueryWrapper();
    const cacheOnly = renderHook(() => useDisplayedSeason({ refresh: 'never', source }), { wrapper });

    await act(async () => undefined);
    expect(source.readSeason).not.toHaveBeenCalled();
    expect(cacheOnly.result.current.data).toBeUndefined();

    renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper });
    await waitFor(() => expect(cacheOnly.result.current.data).toEqual(makeSeason()));
    expect(source.readSeason).toHaveBeenCalledTimes(1);
  });

  it('stays pending without a call while the season module starts', async () => {
    const source = createSeasonDataSource();
    const { result } = renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), {
      wrapper: createModulesTestWrapper(status('season', 'starting')).wrapper,
    });

    await act(async () => undefined);
    expect(result.current.status).toBe('pending');
    expect(source.readSeason).not.toHaveBeenCalled();
  });
});

describe('useDisplayedSeasonAnimes', () => {
  afterEach(() => resetSeasonStore());

  it('loads a once read a single time, however many readers mount', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow()]) });
    const { wrapper } = seasonQueryWrapper();
    const first = renderHook(() => useDisplayedSeasonAnimes({ refresh: 'once', source }), { wrapper });
    await waitFor(() => expect(first.result.current.data).toHaveLength(1));

    renderHook(() => useDisplayedSeasonAnimes({ refresh: 'once', source }), { wrapper });
    await act(async () => undefined);
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('reads the open season rows again when a matching run finishes', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow()]) });
    const { client, wrapper } = seasonQueryWrapper();
    const events = connectBridgeEvents(client);
    const { result } = renderHook(() => useDisplayedSeasonAnimes({ refresh: 'mount', source }), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => events.emit('season.matching_finished'));

    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalledTimes(2));
    events.disconnect();
  });

  it('reads the past season rows the store views', async () => {
    setSeasonStoreState({ viewSeasonId: 'old' });
    const source = createSeasonDataSource({ readPastSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow({ id: 'past-row' })]) });
    const { result } = renderHook(() => useDisplayedSeasonAnimes({ refresh: 'mount', source }), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('past-row'));
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();
  });
});
