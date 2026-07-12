import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    await expect(softDeletePromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(restorePromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(repeatPromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(openPagePromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(copyPagePromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(openFolderPromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
    await expect(copyFolderPromise).resolves.toEqual({ message: 'runtime unavailable', status: 'error' });
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
    const restoreMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });
    const repeatMock = vi.fn().mockResolvedValue({ status: 'ok', animeId: 'anime-1' });

    const softDeletePromise = source.softDeleteAnime?.('anime-1', 1000);
    const restorePromise = source.restoreAnime?.('anime-1', 1001);
    const repeatPromise = source.repeatAnime?.('anime-1', 1002);

    window.go = { main: { App: { RepeatAnime: repeatMock, RestoreAnime: restoreMock, SoftDeleteAnime: softDeleteMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(softDeletePromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(restorePromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
    await expect(repeatPromise).resolves.toEqual({ status: 'ok', animeId: 'anime-1' });
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

  it('degrades getAnimeCover to a placeholder source when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const coverPromise = source.getAnimeCover?.('anime-1');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(coverPromise).resolves.toEqual({ source: 'placeholder' });
  });

  it('degrades getAnimeCover to a placeholder source when the App exists but GetAnimeCover is missing', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const coverPromise = source.getAnimeCover?.('anime-1');

    window.go = { main: { App: { GetSQLiteStatus: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(5000);

    await expect(coverPromise).resolves.toEqual({ source: 'placeholder' });
  });

  it('calls GetAnimeCover once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getAnimeCoverMock = vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });

    const coverPromise = source.getAnimeCover?.('anime-1');

    window.go = { main: { App: { GetAnimeCover: getAnimeCoverMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(coverPromise).resolves.toEqual({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });
    expect(getAnimeCoverMock).toHaveBeenCalledWith('anime-1');
  });

  it('degrades getChapterDayCounts to an empty array when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const countsPromise = source.getChapterDayCounts?.();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(countsPromise).resolves.toEqual([]);
  });

  it('calls GetChapterDayCounts once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getChapterDayCountsMock = vi.fn().mockResolvedValue([{ count: 2, day: 'Lunes' }]);

    const countsPromise = source.getChapterDayCounts?.();

    window.go = { main: { App: { GetChapterDayCounts: getChapterDayCountsMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(countsPromise).resolves.toEqual([{ count: 2, day: 'Lunes' }]);
  });

  it('degrades onPairingTokenConsumed to a no-op unsubscribe when the runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const listener = vi.fn();

    const unsubscribe = source.onPairingTokenConsumed(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shares a single singleton across consumers (no duplicate Wails subscriptions)', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const sourceA = createBridgeRuntimeSource();
    const sourceB = createBridgeRuntimeSource();

    expect(sourceA).toBe(sourceB);

    const unsubscribeA = sourceA.onPairingTokenConsumed(vi.fn());
    const unsubscribeB = sourceB.onPairingTokenConsumed(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    expect(eventsOnMultipleMock).toHaveBeenCalledTimes(1);

    unsubscribeA();
    unsubscribeB();
  });

  it('fires onPairingTokenConsumed listeners when the runtime emits the event', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    let handler: ((...payload: readonly unknown[]) => void) | undefined;
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((_eventName: string, callback: (...payload: readonly unknown[]) => void) => {
        handler = callback;
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createBridgeRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.onPairingTokenConsumed(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handler?.();

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/bridge-runtime-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'bridge-runtime-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/bridge-runtime-source.ts'))).toBe(false);
    expect(sourceText).toContain("from './bridge-runtime-source.types'");
    expect(sourceText).toContain("from './bridge-runtime-source.helpers'");
    expect(sourceText).toContain("from '../wails-bindings.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+BridgeRuntimeSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(sourceText).not.toMatch(/export const\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
    expect(sourceText).not.toMatch(/function hasGoBinding\s*\(/);
    expect(sourceText).not.toMatch(/function waitForBindings\s*\(/);
    expect(sourceText).not.toMatch(/export const\s+bridgeRuntimeSource\b/);
  });

});
