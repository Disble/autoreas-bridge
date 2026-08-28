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

    window.go = { main: { App: { GetSQLiteStatus: getSQLiteStatusMock } } } as never;

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

    window.go = { main: { App: { GetEffectiveAddress: getEffectiveAddressMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(addressPromise).resolves.toBe('192.168.1.10:9876');
  });

  it('calls GetPairingToken once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getPairingTokenMock = vi.fn().mockResolvedValue('token-123');

    const tokenPromise = source.getPairingToken();

    window.go = { main: { App: { GetPairingToken: getPairingTokenMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(tokenPromise).resolves.toBe('token-123');
  });

  it('calls GetAnimes once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getAnimesMock = vi.fn().mockResolvedValue([{ id: 'anime-1', name: 'Test', status: 2, episodesWatched: 5, active: 1 }]);

    const animePromise = source.getAnimes();

    window.go = { main: { App: { GetAnimes: getAnimesMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(animePromise).resolves.toEqual([{ id: 'anime-1', name: 'Test', status: 2, episodesWatched: 5, active: 1 }]);
    expect(getAnimesMock).toHaveBeenCalledTimes(1);
  });

  it('preserves syncing anime items returned by the live Wails binding', async () => {
    const syncingItems = [{ animeId: 'anime-1', nombre: 'Frieren', progress: 0.5 }];
    const getSyncingAnimeItemsMock = vi.fn().mockResolvedValue(syncingItems);
    window.go = { main: { App: { GetSyncingAnimeItems: getSyncingAnimeItemsMock } } } as never;

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

    window.go = { main: { App: { GetAnimeDetail: getAnimeDetailMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(detailPromise).resolves.toEqual(detail);
    expect(getAnimeDetailMock).toHaveBeenCalledWith('anime-1');
  });

  it('calls GetAnimeHistory once Go bindings become ready and resolves the mapped entries', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const entries = [{ id: 'anime-1', name: 'Frieren', episodesWatched: 12, lastWatchedAt: 1700000000000, status: 1 }];
    const getAnimeHistoryMock = vi.fn().mockResolvedValue(entries);

    const historyPromise = source.getAnimeHistory();

    window.go = { main: { App: { GetAnimeHistory: getAnimeHistoryMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(historyPromise).resolves.toEqual(entries);
    expect(getAnimeHistoryMock).toHaveBeenCalledTimes(1);
  });
});
