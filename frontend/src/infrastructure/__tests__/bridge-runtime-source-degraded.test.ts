import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source degraded paths', () => {
  useIsolatedWailsRuntime();

  it('resolves degraded defaults for every method when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();

    const animePromise = source.getAnimes();
    const animeDetailPromise = source.getAnimeDetail?.('anime-1');
    const softDeletePromise = source.softDeleteAnime?.('anime-1', 1000);
    const restorePromise = source.restoreAnime?.('anime-1', 1000);
    const repeatPromise = source.repeatAnime?.('anime-1', 1000);
    const openPagePromise = source.openAnimePage?.('anime-1');
    const copyPagePromise = source.copyAnimePage?.('anime-1');
    const openFolderPromise = source.openAnimeFolder?.('anime-1');
    const copyFolderPromise = source.copyAnimeFolder?.('anime-1');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(animePromise).resolves.toEqual([]);
    await expect(animeDetailPromise).resolves.toBeNull();
    await expect(softDeletePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(restorePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(repeatPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(openPagePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(copyPagePromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(openFolderPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
    await expect(copyFolderPromise).resolves.toEqual({ message: 'runtime unavailable', modifiedAt: 0, status: 'error' });
  });

  it('keeps the pre-migration anime read fallbacks for later-slice consumers when the anime module rejects', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const starting = () => vi.fn().mockRejectedValue(new Error('{"code":"unavailable","message":"anime is starting"}'));
    window.go = { desktop: { App: { GetAnimes: starting(), GetAnimeDetail: starting(), GetAnimeCover: starting(), PreviewAnimeCover: starting() } } } as never;

    const reads = [source.getAnimes(), source.getAnimeDetail('anime-1'), source.getAnimeCover?.('anime-1'), source.previewAnimeCover?.('D:/a.jpg')];
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(Promise.all(reads)).resolves.toEqual([[], null, { source: 'placeholder' }, { source: 'placeholder' }]);
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

    window.go = { desktop: { App: { GetSQLiteStatus: vi.fn() } } } as never;

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
