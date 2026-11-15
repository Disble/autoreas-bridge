import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source mutating bindings', () => {
  useIsolatedWailsRuntime();

  it('calls SoftDeleteAnime, RestoreAnime, and RepeatAnime once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const softDeleteMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });
    const restoreResult = { status: 'ok', animeId: 'anime-1', outcome: 'no_op', modifiedAt: 0 };
    const repeatResult = {
      status: 'ok',
      animeId: 'anime-1',
      outcome: 'conflict',
      modifiedAt: 1003,
      conflictId: 'conflict-7',
    };
    const restoreMock = vi.fn().mockResolvedValue(restoreResult);
    const repeatMock = vi.fn().mockResolvedValue(repeatResult);

    const softDeletePromise = source.softDeleteAnime?.('anime-1', 1000);
    const restorePromise = source.restoreAnime?.('anime-1', 1001);
    const repeatPromise = source.repeatAnime?.('anime-1', 1002);

    window.go = { desktop: { App: { RepeatAnime: repeatMock, RestoreAnime: restoreMock, SoftDeleteAnime: softDeleteMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(softDeletePromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(restorePromise).resolves.toBe(restoreResult);
    await expect(repeatPromise).resolves.toBe(repeatResult);
    expect(softDeleteMock).toHaveBeenCalledWith('anime-1', 1000);
    expect(restoreMock).toHaveBeenCalledWith('anime-1', 1001);
    expect(repeatMock).toHaveBeenCalledWith('anime-1', 1002);
  });

  it('calls page and folder desktop actions once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const openPageMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });
    const copyPageMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });
    const openFolderMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });
    const copyFolderMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });

    const openPagePromise = source.openAnimePage?.('anime-1');
    const copyPagePromise = source.copyAnimePage?.('anime-1');
    const openFolderPromise = source.openAnimeFolder?.('anime-1');
    const copyFolderPromise = source.copyAnimeFolder?.('anime-1');

    window.go = {
      desktop: {
        App: {
          CopyAnimeFolder: copyFolderMock,
          CopyAnimePage: copyPageMock,
          OpenAnimeFolder: openFolderMock,
          OpenAnimePage: openPageMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(openPagePromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(copyPagePromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(openFolderPromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(copyFolderPromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    expect(openPageMock).toHaveBeenCalledWith('anime-1');
    expect(copyPageMock).toHaveBeenCalledWith('anime-1');
    expect(openFolderMock).toHaveBeenCalledWith('anime-1');
    expect(copyFolderMock).toHaveBeenCalledWith('anime-1');
  });

  it('maps a rejected desktop action to an error status carrying its message for later-slice consumers', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const openPageMock = vi.fn().mockRejectedValue(new Error('{"code":"invalid_argument","message":"anime anime-1 has no page"}'));
    const openPagePromise = createBridgeRuntimeSource().openAnimePage?.('anime-1');

    window.go = { desktop: { App: { OpenAnimePage: openPageMock } } } as never;
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(openPagePromise).resolves.toEqual({ status: 'error', modifiedAt: 0, message: 'anime anime-1 has no page' });
  });
});
