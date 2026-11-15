import { describe, expect, it, vi } from 'vitest';

import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One schedule row as the binding answers it. */
const FRIEREN_ROW = { animeId: 'anime-1', animeName: 'Frieren', day: 'Viernes', dayOrder: 1, status: 0, episodesWatched: 3, hasCover: false, modified_at: 1000 };

/** Attaches the two episode bindings to a fake Wails `window.go`. */
function attachBindings(bindings: { readonly GetEpisodeSchedule?: unknown; readonly GetEpisodeDayCounts?: unknown }) {
  window.go = { desktop: { App: bindings } } as never;
}

describe('createEpisodesSource', () => {
  useIsolatedWailsRuntime();

  it('answers what each binding answers, passing the day through', async () => {
    const { createEpisodesSource } = await import('../episodes-source.helpers');
    const getEpisodeSchedule = vi.fn().mockResolvedValue([FRIEREN_ROW]);
    attachBindings({ GetEpisodeSchedule: getEpisodeSchedule, GetEpisodeDayCounts: vi.fn().mockResolvedValue([{ day: 'Lunes', count: 2 }]) });
    const source = createEpisodesSource();

    await expect(source.getEpisodeSchedule('Viernes')).resolves.toEqual([FRIEREN_ROW]);
    await expect(source.getEpisodeDayCounts()).resolves.toEqual([{ day: 'Lunes', count: 2 }]);
    expect(getEpisodeSchedule).toHaveBeenCalledExactlyOnceWith('Viernes');
  });

  it.each([
    ['the module is starting', '{"code":"unavailable","message":"episodes is starting"}', { code: 'unavailable', message: 'episodes is starting' }],
    ['the module failed', '{"code":"failed_precondition","message":"episodes: db closed"}', { code: 'failed_precondition', message: 'episodes: db closed' }],
    ['a plain rejection', 'boom', { code: 'internal', message: 'boom' }],
  ])('rejects both reads with a BridgeError when %s, never with []', async (_label, rejection, expected) => {
    const { createEpisodesSource } = await import('../episodes-source.helpers');
    attachBindings({
      GetEpisodeSchedule: vi.fn().mockRejectedValue(new Error(rejection)),
      GetEpisodeDayCounts: vi.fn().mockRejectedValue(new Error(rejection)),
    });
    const source = createEpisodesSource();

    await expect(source.getEpisodeSchedule('Viernes')).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    await expect(source.getEpisodeDayCounts()).rejects.toMatchObject({ name: 'BridgeError', ...expected });
  });

  it('rejects both reads as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const { createEpisodesSource } = await import('../episodes-source.helpers');
    const source = createEpisodesSource();

    const schedule = expect(source.getEpisodeSchedule('Viernes')).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) });
    const counts = expect(source.getEpisodeDayCounts()).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await schedule;
    await counts;
  });
});
