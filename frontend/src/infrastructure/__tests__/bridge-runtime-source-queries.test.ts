import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source read bindings', () => {
  useIsolatedWailsRuntime();

  it('calls GetSQLiteStatus once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getSQLiteStatusMock = vi.fn().mockResolvedValue('ok');

    const statusPromise = source.getSQLiteStatus();

    window.go = { desktop: { App: { GetSQLiteStatus: getSQLiteStatusMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(statusPromise).resolves.toBe('ok');
    expect(getSQLiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('calls GetEffectiveAddress once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getEffectiveAddressMock = vi.fn().mockResolvedValue('192.168.1.10:9876');

    const addressPromise = source.getEffectiveAddress();

    window.go = { desktop: { App: { GetEffectiveAddress: getEffectiveAddressMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(addressPromise).resolves.toBe('192.168.1.10:9876');
  });

  it('calls GetPairingToken once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getPairingTokenMock = vi.fn().mockResolvedValue('token-123');

    const tokenPromise = source.getPairingToken();

    window.go = { desktop: { App: { GetPairingToken: getPairingTokenMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(tokenPromise).resolves.toBe('token-123');
  });

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

  it('preserves syncing anime items returned by the live Wails binding', async () => {
    const syncingItems = [{ animeId: 'anime-1', nombre: 'Frieren', progress: 0.5 }];
    const getSyncingAnimeItemsMock = vi.fn().mockResolvedValue(syncingItems);
    window.go = { desktop: { App: { GetSyncingAnimeItems: getSyncingAnimeItemsMock } } } as never;

    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    await expect(source.getSyncingAnimeItems()).resolves.toEqual(syncingItems);
    expect(getSyncingAnimeItemsMock).toHaveBeenCalledTimes(1);
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

  it('calls GetWatchHistoryPage once Go bindings become ready and resolves the mapped page', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const page = {
      items: [{ id: 1, animeId: 'anime-1', animeName: 'Frieren', episode: 12, cycle: 1, watchedAtMs: 1700000000000, source: 'desktop' }],
      nextCursor: '1700000000000:1',
      status: 'ok',
    };
    const getWatchHistoryPageMock = vi.fn().mockResolvedValue(page);

    const pagePromise = source.getWatchHistoryPage?.('');

    window.go = { desktop: { App: { GetWatchHistoryPage: getWatchHistoryPageMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(pagePromise).resolves.toEqual(page);
    expect(getWatchHistoryPageMock).toHaveBeenCalledWith('');
  });

  it('calls GetAnimeWatchHistoryPage with the anime id and cursor once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const page = {
      items: [{ id: 2, animeId: 'anime-1', animeName: 'Frieren', episode: 13, cycle: 1, watchedAtMs: 1700000001000, source: 'mobile' }],
      status: 'ok',
    };
    const getAnimeWatchHistoryPageMock = vi.fn().mockResolvedValue(page);

    const pagePromise = source.getAnimeWatchHistoryPage?.('anime-1', '1700000000000:1');

    window.go = { desktop: { App: { GetAnimeWatchHistoryPage: getAnimeWatchHistoryPageMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(pagePromise).resolves.toEqual(page);
    expect(getAnimeWatchHistoryPageMock).toHaveBeenCalledWith('anime-1', '1700000000000:1');
  });
});
