import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source degraded paths', () => {
  useIsolatedWailsRuntime();

  it('resolves degraded defaults for every method when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const statusPromise = source.getSQLiteStatus();
    const addressPromise = source.getEffectiveAddress();
    const tokenPromise = source.getPairingToken();
    const syncingAnimePromise = source.getSyncingAnimeItems();
    const animePromise = source.getAnimes();
    const animeDetailPromise = source.getAnimeDetail?.('anime-1');
    const softDeletePromise = source.softDeleteAnime?.('anime-1', 1000);
    const restorePromise = source.restoreAnime?.('anime-1', 1000);
    const repeatPromise = source.repeatAnime?.('anime-1', 1000);
    const openPagePromise = source.openAnimePage?.('anime-1');
    const copyPagePromise = source.copyAnimePage?.('anime-1');
    const openFolderPromise = source.openAnimeFolder?.('anime-1');
    const copyFolderPromise = source.copyAnimeFolder?.('anime-1');
    const reconcilePromise = source.triggerReconcile();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(statusPromise).resolves.toBe('runtime unavailable');
    await expect(addressPromise).resolves.toBe('');
    await expect(tokenPromise).resolves.toBe('');
    await expect(syncingAnimePromise).resolves.toEqual([]);
    await expect(animePromise).resolves.toEqual([]);
    await expect(animeDetailPromise).resolves.toBeNull();
    await expect(softDeletePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(restorePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(repeatPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(openPagePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(copyPagePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(openFolderPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(copyFolderPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(reconcilePromise).resolves.toBe('runtime unavailable');
  });

  it('resolves degraded defaults when the App exists but a specific binding is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const animePromise = source.getSyncingAnimeItems();

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(animePromise).resolves.toEqual([]);
  });

  it('degrades getAnimeHistory to an empty array when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const historyPromise = source.getAnimeHistory();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(historyPromise).resolves.toEqual([]);
  });

  it('degrades getAnimeHistory to an empty array when the App exists but GetAnimeHistory is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const historyPromise = source.getAnimeHistory();

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(historyPromise).resolves.toEqual([]);
  });

  it('degrades getAnimeDetail to null when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const detailPromise = source.getAnimeDetail('anime-1');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(detailPromise).resolves.toBeNull();
  });

  it('degrades getAnimeDetail to null when the App exists but GetAnimeDetail is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const detailPromise = source.getAnimeDetail('anime-1');

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(detailPromise).resolves.toBeNull();
  });

  it('degrades createAnime to an error outcome when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const createPromise = source.createAnime?.({ creates: [], changedNeighbors: [] });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(createPromise).resolves.toEqual(
      expect.objectContaining({ outcome: 'error', message: 'runtime unavailable' }),
    );
  });
});
