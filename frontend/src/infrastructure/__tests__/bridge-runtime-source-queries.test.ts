import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source read bindings', () => {
  useIsolatedWailsRuntime();

  it('calls GetAnimes once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getAnimesMock = vi.fn().mockResolvedValue([{ id: 'anime-1', name: 'Test', status: 2, episodesWatched: 5, active: 1 }]);

    const animePromise = source.getAnimes();

    window.go = { desktop: { App: { GetAnimes: getAnimesMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(animePromise).resolves.toEqual([{ id: 'anime-1', name: 'Test', status: 2, episodesWatched: 5, active: 1 }]);
    expect(getAnimesMock).toHaveBeenCalledTimes(1);
  });

  it('calls GetAnimeDetail once Go bindings become ready and resolves the mapped DTO', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const detail = {
      id: 'anime-1',
      name: 'Frieren',
      status: 2,
      episodesWatched: 5,
      active: 1,
      firstCycle: 0,
      days: [{ day: 'Miércoles', order: 1 }],
      genres: ['Aventura'],
      modified_at: 123,
    };
    const getAnimeDetailMock = vi.fn().mockResolvedValue(detail);

    const detailPromise = source.getAnimeDetail('anime-1');

    window.go = { desktop: { App: { GetAnimeDetail: getAnimeDetailMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(detailPromise).resolves.toEqual(detail);
    expect(getAnimeDetailMock).toHaveBeenCalledWith('anime-1');
  });
});
