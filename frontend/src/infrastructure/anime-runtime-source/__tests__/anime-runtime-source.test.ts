import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('anime-runtime-source', () => {
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

  it('degrades subscribeAnimeChanges to a no-op unsubscribe when the runtime is unavailable', async () => {
    const { createAnimeRuntimeSource } = await import('../anime-runtime-source.helpers');
    const source = createAnimeRuntimeSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribeAnimeChanges(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribes to the anime.changed event and forwards the notice to listeners', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
      handlers.set(eventName, callback);
      return () => undefined;
    });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createAnimeRuntimeSource } = await import('../anime-runtime-source.helpers');
    const source = createAnimeRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeAnimeChanges(listener);

    await vi.advanceTimersByTimeAsync(5000);

    const notice = { animeId: 'anime-1', changeType: 'update', changedFields: ['episodesWatched'], correlationId: 'corr-1' };
    handlers.get('anime.changed')?.(notice);

    expect(listener).toHaveBeenCalledWith(notice);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('anime.changed', expect.any(Function), -1);

    unsubscribe();
  });

  it('shares a single singleton across multiple createAnimeRuntimeSource calls', async () => {
    const { createAnimeRuntimeSource } = await import('../anime-runtime-source.helpers');

    expect(createAnimeRuntimeSource()).toBe(createAnimeRuntimeSource());
  });

  it('stops forwarding events to a listener once it unsubscribes', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
      handlers.set(eventName, callback);
      return () => undefined;
    });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createAnimeRuntimeSource } = await import('../anime-runtime-source.helpers');
    const source = createAnimeRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeAnimeChanges(listener);

    await vi.advanceTimersByTimeAsync(5000);

    unsubscribe();
    handlers.get('anime.changed')?.({ animeId: 'anime-1' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/anime-runtime-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'anime-runtime-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(sourceText).toContain("from './anime-runtime-source.types'");
    expect(sourceText).toContain("from './anime-runtime-source.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+AnimeRuntimeSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
