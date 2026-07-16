import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bridge-runtime-source cover and events', () => {
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

  it('degrades cover and chapter counts while runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const coverPromise = source.getAnimeCover?.('anime-1');
    const countsPromise = source.getChapterDayCounts?.();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(coverPromise).resolves.toEqual({ source: 'placeholder' });
    await expect(countsPromise).resolves.toEqual([]);
  });

  it('returns explicit fallback outcomes for all five required editor calls', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const patch = {
      page: { present: false, clear: false, value: '' }, folder: { present: false, clear: false, value: '' },
      origin: { present: false, clear: false, value: '' }, duration: { present: false, clear: false, value: '' },
      kind: { present: false, clear: false, value: '' }, premieredAt: { present: false, clear: false, value: '' },
      cover: { present: false, clear: false, type: '', path: '' },
    };
    const promises = [
      source.getAnimeEditorRecord('anime-1'),
      source.saveAnimeEditor({ animeId: 'anime-1', baseModifiedAt: 1, patch }),
      source.deactivateAnime('anime-1', 1),
      source.getAnimeEditorScheduleBoard('anime-1'),
      source.applyAnimeEditorSchedule({ boardModifiedAt: 1, entries: [] }),
    ];
    await vi.advanceTimersByTimeAsync(5000);
    await expect(Promise.all(promises)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: 'error', message: 'runtime unavailable' }),
    ]));
  });

  it('calls cover and chapter-count bindings once ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });
    const getChapterDayCounts = vi.fn().mockResolvedValue([{ count: 2, day: 'Lunes' }]);
    const coverPromise = source.getAnimeCover?.('anime-1');
    const countsPromise = source.getChapterDayCounts?.();
    window.go = { main: { App: { GetAnimeCover: getAnimeCover, GetChapterDayCounts: getChapterDayCounts } } } as never;
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await expect(coverPromise).resolves.toEqual({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });
    await expect(countsPromise).resolves.toEqual([{ count: 2, day: 'Lunes' }]);
  });

  it('shares one pairing subscription and emits to listeners', async () => {
    let handler: (() => void) | undefined;
    const eventsOnMultiple = vi.fn().mockImplementation((_name: string, callback: () => void) => {
      handler = callback;
      return () => undefined;
    });
    window.runtime = { EventsOnMultiple: eventsOnMultiple } as never;
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.onPairingTokenConsumed(listener);
    const unsubscribeSecond = createBridgeRuntimeSource().onPairingTokenConsumed(vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    handler?.();
    expect(eventsOnMultiple).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribeSecond();
  });
});
