import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonMatchingProgressWire } from '../season-source.types';

/**
 * Builds one wire progress payload in the exact capitalized shape the desktop
 * bridge forwards (the raw Go event struct, which carries no `json` tags).
 * @param overrides Per-test wire-field replacements.
 * @returns A wire progress payload.
 */
function wireProgress(overrides: Partial<SeasonMatchingProgressWire> = {}): SeasonMatchingProgressWire {
  return {
    SeasonID: 'season-1',
    Phase: 'name_matching',
    RowID: 'row-1',
    RawName: 'Good Anime',
    MatchStatus: 'matched',
    MatchedSlug: 'https://jkanime.net/good-anime/',
    Candidates: [{ Title: 'Good Anime', PageURL: 'https://jkanime.net/good-anime/', Score: 0.98 }],
    Availability: 'waiting',
    AvailableEpisodes: 0,
    ...overrides,
  };
}

describe('season matching source seam', () => {
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

  it('maps the started wire payload onto the run total', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const source = createSeasonSource();
    const listener = vi.fn();
    source.subscribeMatchingStarted?.(listener);
    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('season.matching_started')?.({ SeasonID: 'season-1', Total: 4 });

    expect(listener).toHaveBeenCalledWith({ seasonId: 'season-1', total: 4 });
  });

  it('maps one wire progress row onto the patched row shape, candidates included', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const source = createSeasonSource();
    const listener = vi.fn();
    source.subscribeMatchingProgress?.(listener);
    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('season.matching_progress')?.(wireProgress());

    expect(listener).toHaveBeenCalledWith({
      seasonId: 'season-1',
      phase: 'name_matching',
      rowId: 'row-1',
      rawName: 'Good Anime',
      matchStatus: 'matched',
      matchedSlug: 'https://jkanime.net/good-anime/',
      candidates: [{ title: 'Good Anime', pageUrl: 'https://jkanime.net/good-anime/', score: 0.98 }],
      availability: 'waiting',
      availableEpisodes: 0,
    });
  });

  it('reads a nil candidate list as empty so a matched row without candidates still patches', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const source = createSeasonSource();
    const listener = vi.fn();
    source.subscribeMatchingProgress?.(listener);
    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('season.matching_progress')?.(wireProgress({ Candidates: null as never }));

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ candidates: [] }));
  });

  it('rejects a progress payload whose phase the contract does not name', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const source = createSeasonSource();
    const listener = vi.fn();
    source.subscribeMatchingProgress?.(listener);
    await vi.advanceTimersByTimeAsync(5000);

    expect(() => handlers.get('season.matching_progress')?.(wireProgress({ Phase: 'sondeando' }))).toThrow(
      /Unknown season matching phase/,
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it('maps the finished wire payload onto the terminal signal', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const source = createSeasonSource();
    const listener = vi.fn();
    source.subscribeMatchingFinished?.(listener);
    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('season.matching_finished')?.({ SeasonID: 'season-1' });

    expect(listener).toHaveBeenCalledWith({ seasonId: 'season-1' });
  });

  it('degrades every matching subscription to a no-op unsubscribe when the runtime is absent', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const source = createSeasonSource();

    const unsubscribeStarted = source.subscribeMatchingStarted?.(vi.fn());
    const unsubscribeProgress = source.subscribeMatchingProgress?.(vi.fn());
    const unsubscribeFinished = source.subscribeMatchingFinished?.(vi.fn());
    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribeStarted?.()).not.toThrow();
    expect(() => unsubscribeProgress?.()).not.toThrow();
    expect(() => unsubscribeFinished?.()).not.toThrow();
  });

  it('searches every provider through the live binding with the typed query', async () => {
    const page = { title: 'Ao Ashi Season 2', pageUrl: 'https://jkanime.net/ao-ashi-2/', provider: 'jkanime' };
    const searchMock = vi.fn().mockResolvedValue({ status: 'ok', pages: [page] });
    window.go = { desktop: { App: { SearchSeasonProviders: searchMock } } } as never;
    const { createSeasonSource } = await import('../season-source.helpers');

    const search = createSeasonSource().searchProviders?.('Ao Ashi');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(search).resolves.toEqual({ status: 'ok', pages: [page] });
    expect(searchMock).toHaveBeenCalledExactlyOnceWith('Ao Ashi');
  });

  it('restores a discarded row through the live binding with its row id', async () => {
    const restoreMock = vi.fn().mockResolvedValue('ok');
    window.go = { desktop: { App: { RestoreSeasonName: restoreMock } } } as never;
    const { createSeasonSource } = await import('../season-source.helpers');

    const restore = createSeasonSource().restoreName('row-1');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(restore).resolves.toBe('ok');
    expect(restoreMock).toHaveBeenCalledExactlyOnceWith('row-1');
  });

  it('degrades a restore to the unavailable message when no binding exists', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const { SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source.constants');

    const restore = createSeasonSource().restoreName('row-1');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(restore).resolves.toBe(SEASON_RUNTIME_UNAVAILABLE);
  });

  it('degrades the provider search to an unavailable status with no pages when no binding exists', async () => {
    const { createSeasonSource } = await import('../season-source.helpers');
    const { SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source.constants');

    const search = createSeasonSource().searchProviders?.('Ao Ashi');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(search).resolves.toEqual({ status: SEASON_RUNTIME_UNAVAILABLE, pages: [] });
  });
});
