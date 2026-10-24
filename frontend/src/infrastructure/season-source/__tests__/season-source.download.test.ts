import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEASON_RUNTIME_UNAVAILABLE } from '../season-source.constants';

describe('season source Ver hoy subset download', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('forwards the chosen anime ids to the Go binding and returns its status', async () => {
    const DownloadSeasonAnimes = vi.fn().mockResolvedValue('ok');
    Reflect.set(window, 'go', { desktop: { App: { DownloadSeasonAnimes } } });
    const { createSeasonSource } = await import('../season-source.helpers');

    await expect(createSeasonSource().downloadSeasonAnimes(['anime-a', 'anime-b'])).resolves.toBe('ok');
    expect(DownloadSeasonAnimes).toHaveBeenCalledWith(['anime-a', 'anime-b']);
  });

  it('reports the runtime unavailable when the binding never appears', async () => {
    vi.useFakeTimers();
    const { createSeasonSource } = await import('../season-source.helpers');

    const status = createSeasonSource().downloadSeasonAnimes(['anime-a']);
    await vi.runAllTimersAsync();

    await expect(status).resolves.toBe(SEASON_RUNTIME_UNAVAILABLE);
  });
});
