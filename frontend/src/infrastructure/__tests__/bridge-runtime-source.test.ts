import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bridge-runtime-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('resolves degraded defaults for every method when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
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
    const pullPromise = source.pullAnimesFromLegacy();
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
    await expect(pullPromise).resolves.toEqual({
      message: 'runtime unavailable',
      prunedCount: 0,
      status: 'error',
      updatedCount: 0,
      warningCount: 0,
    });
    await expect(reconcilePromise).resolves.toBe('runtime unavailable');
  });

  it('resolves degraded defaults when the App exists but a specific binding is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const animePromise = source.getSyncingAnimeItems();

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(animePromise).resolves.toEqual([]);
  });

  it('calls GetSQLiteStatus once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getSQLiteStatusMock = vi.fn().mockResolvedValue('ok');

    const statusPromise = source.getSQLiteStatus();

    window.go = { main: { App: { GetSQLiteStatus: getSQLiteStatusMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(statusPromise).resolves.toBe('ok');
    expect(getSQLiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('calls GetEffectiveAddress once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getEffectiveAddressMock = vi.fn().mockResolvedValue('192.168.1.10:8080');

    const addressPromise = source.getEffectiveAddress();

    window.go = { main: { App: { GetEffectiveAddress: getEffectiveAddressMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(addressPromise).resolves.toBe('192.168.1.10:8080');
  });

  it('calls GetPairingToken once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getPairingTokenMock = vi.fn().mockResolvedValue('token-123');

    const tokenPromise = source.getPairingToken();

    window.go = { main: { App: { GetPairingToken: getPairingTokenMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(tokenPromise).resolves.toBe('token-123');
  });

  it('calls GetAnimes once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getAnimesMock = vi.fn().mockResolvedValue([{ id: 'anime-1', nombre: 'Test', estado: 2, nrocapvisto: 5, activo: 1 }]);

    const animePromise = source.getAnimes();

    window.go = { main: { App: { GetAnimes: getAnimesMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(animePromise).resolves.toEqual([{ id: 'anime-1', nombre: 'Test', estado: 2, nrocapvisto: 5, activo: 1 }]);
    expect(getAnimesMock).toHaveBeenCalledTimes(1);
  });

  it('preserves syncing anime items returned by the live Wails binding', async () => {
    const syncingItems = [{ animeId: 'anime-1', nombre: 'Frieren', progress: 0.5 }];
    const getSyncingAnimeItemsMock = vi.fn().mockResolvedValue(syncingItems);
    window.go = { main: { App: { GetSyncingAnimeItems: getSyncingAnimeItemsMock } } } as never;

    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    await expect(source.getSyncingAnimeItems()).resolves.toEqual(syncingItems);
    expect(getSyncingAnimeItemsMock).toHaveBeenCalledTimes(1);
  });

  it('calls GetAnimeDetail once Go bindings become ready and resolves the mapped DTO', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const detail = {
      _id: 'anime-1',
      nombre: 'Frieren',
      estado: 2,
      nrocapvisto: 5,
      activo: 1,
      primeravez: 0,
      dias: [{ dia: 'Miércoles', orden: 1 }],
      generos: ['Aventura'],
      modified_at: 123,
    };
    const getAnimeDetailMock = vi.fn().mockResolvedValue(detail);

    const detailPromise = source.getAnimeDetail('anime-1');

    window.go = { main: { App: { GetAnimeDetail: getAnimeDetailMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(detailPromise).resolves.toEqual(detail);
    expect(getAnimeDetailMock).toHaveBeenCalledWith('anime-1');
  });

  it('calls the anime editor bindings once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const record = {
      animeId: 'anime-1',
      modifiedAt: 123,
      frequent: { name: 'Frieren', status: 0, progress: 2, active: true, placements: [] },
      details: { genres: [], studios: { kind: 'missing', values: [] } },
    };
    const getAnimeEditorRecordMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      record: {
        animeId: 'anime-1',
        modifiedAt: 123,
        frequent: {
          name: 'Frieren', status: 0, progress: 2, active: true, placements: [],
          totalEpisodes: { kind: 'missing' }, kind: { kind: 'missing' }, page: { kind: 'missing' }, folder: { kind: 'missing' },
        },
        details: {
          premieredAt: { kind: 'missing' }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });
    const saveAnimeEditorMock = vi.fn().mockResolvedValue({
      animeId: 'anime-1',
      outcome: 'conflict',
      message: 'current authority won',
      modifiedAt: 200,
      record: {
        animeId: 'anime-1', modifiedAt: 200,
        frequent: {
          name: 'Authority', status: 0, progress: 3, active: true, placements: [],
          totalEpisodes: { kind: 'missing' }, kind: { kind: 'missing' }, page: { kind: 'missing' }, folder: { kind: 'missing' },
        },
        details: {
          premieredAt: { kind: 'missing' }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });
    const deactivateAnimeMock = vi.fn().mockResolvedValue({ animeId: 'anime-1', outcome: 'applied', message: 'deactivated', modifiedAt: 201 });
    const getBoardMock = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 123, destinations: [], entries: [] } });
    const refreshedBoard = { originAnimeId: 'anime-1', boardModifiedAt: 202, destinations: [], entries: [] };
    const applyBoardMock = vi.fn().mockResolvedValue({ outcome: 'conflict', message: 'board changed', modifiedAt: 202, board: refreshedBoard });

    const recordPromise = source.getAnimeEditorRecord?.('anime-1');
    const savePromise = source.saveAnimeEditor?.({
      animeId: 'anime-1',
      baseModifiedAt: 100,
      patch: {
        page: { present: false, clear: false, value: '' },
        folder: { present: false, clear: false, value: '' },
        origin: { present: false, clear: false, value: '' },
        duration: { present: false, clear: false, value: '' },
        kind: { present: false, clear: false, value: '' },
        premieredAt: { present: false, clear: false, value: '' },
        cover: { present: false, clear: false, type: '', path: '' },
      },
    });
    const deactivatePromise = source.deactivateAnime?.('anime-1', 100);
    const boardPromise = source.getAnimeEditorScheduleBoard?.('anime-1');
    const applyPromise = source.applyAnimeEditorSchedule?.({ boardModifiedAt: 123, entries: [] });

    window.go = {
      main: {
        App: {
          ApplyAnimeEditorSchedule: applyBoardMock,
          DeactivateAnime: deactivateAnimeMock,
          GetAnimeEditorRecord: getAnimeEditorRecordMock,
          GetAnimeEditorScheduleBoard: getBoardMock,
          SaveAnimeEditor: saveAnimeEditorMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(recordPromise).resolves.toEqual(expect.objectContaining({ outcome: 'applied', message: 'loaded', record }));
    await expect(savePromise).resolves.toEqual(expect.objectContaining({
      animeId: 'anime-1',
      outcome: 'conflict',
      message: 'current authority won',
      modifiedAt: 200,
      record: expect.objectContaining({ animeId: 'anime-1', modifiedAt: 200 }),
    }));
    await expect(deactivatePromise).resolves.toEqual(expect.objectContaining({ animeId: 'anime-1', outcome: 'applied', message: 'deactivated', modifiedAt: 201 }));
    await expect(boardPromise).resolves.toEqual({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 123, destinations: [], entries: [] } });
    await expect(applyPromise).resolves.toEqual(expect.objectContaining({ outcome: 'conflict', message: 'board changed', modifiedAt: 202, board: refreshedBoard }));
    expect(getAnimeEditorRecordMock).toHaveBeenCalledWith('anime-1');
    expect(saveAnimeEditorMock).toHaveBeenCalledWith(expect.objectContaining({
      animeId: 'anime-1',
      patch: expect.objectContaining({ page: { present: false, clear: false, value: '' } }),
    }));
    expect(deactivateAnimeMock).toHaveBeenCalledWith('anime-1', 100);
    expect(getBoardMock).toHaveBeenCalledWith('anime-1');
    expect(applyBoardMock).toHaveBeenCalledWith({ boardModifiedAt: 123, entries: [] });
  });

  it('maps a value-kind zero tipo to a concrete 0 across the wire boundary', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    // Reproduces the reported bug's payload: the backend reports tipo=0
    // ("Anime (TV)") as an explicit value-kind zero. The mapper must surface it
    // as frequent.kind === 0, never drop it to undefined (which rendered the
    // Type field empty and forced an endless no_op save loop).
    const getAnimeEditorRecordMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      record: {
        animeId: 'anime-1',
        modifiedAt: 123,
        frequent: {
          name: 'BanG Dream', status: 0, progress: 1, active: true, placements: [],
          totalEpisodes: { kind: 'value', value: 0 }, kind: { kind: 'value', value: 0 },
          page: { kind: 'value', value: 'https://example.test/x' }, folder: { kind: 'value', value: 'D:/Anime/x' },
        },
        details: {
          premieredAt: { kind: 'value', unixMilli: 0 }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });

    const recordPromise = source.getAnimeEditorRecord?.('anime-1');

    window.go = { main: { App: { GetAnimeEditorRecord: getAnimeEditorRecordMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    const result = await recordPromise;
    expect(result?.record?.frequent.kind).toBe(0);
    expect(result?.record?.frequent.totalEpisodes).toBe(0);
    expect(result?.record?.details.premieredAt).toBe(0);
  });

  it('calls GetAnimeHistory once Go bindings become ready and resolves the mapped entries', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const entries = [{ id: 'anime-1', nombre: 'Frieren', nrocapvisto: 12, fechaUltCapVisto: 1700000000000, estado: 1 }];
    const getAnimeHistoryMock = vi.fn().mockResolvedValue(entries);

    const historyPromise = source.getAnimeHistory();

    window.go = { main: { App: { GetAnimeHistory: getAnimeHistoryMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(historyPromise).resolves.toEqual(entries);
    expect(getAnimeHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('degrades getAnimeHistory to an empty array when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const historyPromise = source.getAnimeHistory();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(historyPromise).resolves.toEqual([]);
  });

  it('degrades getAnimeHistory to an empty array when the App exists but GetAnimeHistory is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const historyPromise = source.getAnimeHistory();

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(historyPromise).resolves.toEqual([]);
  });

  it('degrades getAnimeDetail to null when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const detailPromise = source.getAnimeDetail('anime-1');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(detailPromise).resolves.toBeNull();
  });

  it('degrades getAnimeDetail to null when the App exists but GetAnimeDetail is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const detailPromise = source.getAnimeDetail('anime-1');

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(detailPromise).resolves.toBeNull();
  });

  it('calls SoftDeleteAnime, RestoreAnime, and RepeatAnime once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
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
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
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

  it('calls TriggerReconcile once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const triggerReconcileMock = vi.fn().mockResolvedValue('done');

    const reconcilePromise = source.triggerReconcile();

    window.go = { main: { App: { TriggerReconcile: triggerReconcileMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(reconcilePromise).resolves.toBe('done');
  });

  it('calls PullAnimesFromLegacy once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const pullAnimesFromLegacyMock = vi.fn().mockResolvedValue({
      message: 'Pulled 2 updates from legacy.',
      prunedCount: 0,
      status: 'ok',
      updatedCount: 2,
      warningCount: 0,
    });
    const triggerReconcileMock = vi.fn().mockResolvedValue('wrong path');

    const pullPromise = source.pullAnimesFromLegacy();

    window.go = {
      main: {
        App: {
          PullAnimesFromLegacy: pullAnimesFromLegacyMock,
          TriggerReconcile: triggerReconcileMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(pullPromise).resolves.toEqual({
      message: 'Pulled 2 updates from legacy.',
      prunedCount: 0,
      status: 'ok',
      updatedCount: 2,
      warningCount: 0,
    });
    expect(pullAnimesFromLegacyMock).toHaveBeenCalledTimes(1);
    expect(triggerReconcileMock).not.toHaveBeenCalled();
  });

});
