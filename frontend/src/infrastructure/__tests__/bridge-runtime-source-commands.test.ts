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

    window.go = { main: { App: { RepeatAnime: repeatMock, RestoreAnime: restoreMock, SoftDeleteAnime: softDeleteMock } } } as never;

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
      main: {
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

  it('calls CreateAnime once Go bindings become ready and maps the wire DTO', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const createAnimeMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'created',
      animeIds: ['anime-new-1'],
      modifiedAt: 555,
    });

    const createPromise = source.createAnime?.({
      creates: [
        {
          name: 'Frieren',
          page: 'https://example.test/frieren',
          placements: [{ day: 'Miércoles', order: 1 }],
          folder: 'D:/Anime/Frieren',
          kind: 0,
          episodesWatched: 2,
          totalEpisodes: 12,
          durationMinutes: 24,
          origin: 'Light novel',
          genres: ['Adventure', 'Drama'],
          studios: ['Madhouse'],
          cover: { type: 'image', path: 'D:/Anime/Frieren/cover.jpg' },
        },
      ],
      changedNeighbors: [
        { animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Miércoles', order: 2 }] },
      ],
    });

    window.go = { main: { App: { CreateAnime: createAnimeMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(createPromise).resolves.toEqual({
      outcome: 'applied',
      message: 'created',
      animeIds: ['anime-new-1'],
      modifiedAt: 555,
    });
    expect(createAnimeMock).toHaveBeenCalledWith({
      creates: [
        {
          nombre: 'Frieren',
          pagina: 'https://example.test/frieren',
          dias: [{ day: 'Miércoles', order: 1 }],
          carpeta: 'D:/Anime/Frieren',
          tipo: 0,
          episodesWatched: 2,
          totalEpisodes: 12,
          durationMinutes: 24,
          origin: 'Light novel',
          genres: ['Adventure', 'Drama'],
          studios: ['Madhouse'],
          cover: { type: 'image', path: 'D:/Anime/Frieren/cover.jpg' },
        },
      ],
      changedNeighbors: [
        { animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Miércoles', order: 2 }] },
      ],
    });
  });

  it('calls TriggerReconcile once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const triggerReconcileMock = vi.fn().mockResolvedValue('done');

    const reconcilePromise = source.triggerReconcile();

    window.go = { main: { App: { TriggerReconcile: triggerReconcileMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(reconcilePromise).resolves.toBe('done');
  });
});
