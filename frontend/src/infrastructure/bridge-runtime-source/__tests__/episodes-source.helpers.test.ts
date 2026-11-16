import { describe, expect, it, vi } from 'vitest';

import type { EpisodeCommandsSource } from '../../../shared/contracts/episodes.types';
import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One schedule row as the binding answers it. */
const FRIEREN_ROW = { animeId: 'anime-1', animeName: 'Frieren', day: 'Viernes', dayOrder: 1, status: 0, episodesWatched: 3, hasCover: false, modified_at: 1000 };

/** An applied command outcome as the episodes command bindings answer it. */
const APPLIED_OUTCOME = { status: 'ok', animeId: 'anime-1', outcome: 'applied', modifiedAt: 1001 };

/** Every episodes command: the binding it calls, how the source calls it, and the arguments the binding receives. */
const EPISODE_COMMANDS = [
  ['AdjustWatchedEpisodes', (source: EpisodeCommandsSource) => source.adjustWatchedEpisodes('anime-1', 0.5, 1000), ['anime-1', 0.5, 1000]],
  ['SetAnimeState', (source: EpisodeCommandsSource) => source.setAnimeState('anime-1', 1, 1000), ['anime-1', 1, 1000]],
  ['RestoreAnime', (source: EpisodeCommandsSource) => source.restoreAnime('anime-1', 1000), ['anime-1', 1000]],
  ['RepeatAnime', (source: EpisodeCommandsSource) => source.repeatAnime('anime-1', 1000), ['anime-1', 1000]],
] as const;

/** Attaches episode bindings, by `App` method name, to a fake Wails `window.go`. */
function attachBindings(bindings: Readonly<Record<string, unknown>>) {
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

  it.each(EPISODE_COMMANDS)('answers the %s outcome and rejects its failure with a BridgeError', async (binding, invoke, args) => {
    const { createEpisodesSource } = await import('../episodes-source.helpers');
    const call = vi.fn().mockResolvedValueOnce(APPLIED_OUTCOME).mockRejectedValueOnce(new Error('{"code":"unavailable","message":"episodes is starting"}'));
    attachBindings({ [binding]: call });
    const source = createEpisodesSource();

    await expect(invoke(source)).resolves.toEqual(APPLIED_OUTCOME);
    await expect(invoke(source)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: 'episodes is starting' });
    expect(call).toHaveBeenNthCalledWith(1, ...args);
  });

  it.each(EPISODE_COMMANDS)('rejects %s as unavailable when its binding never attaches', async (_binding, invoke) => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const { createEpisodesSource } = await import('../episodes-source.helpers');

    const command = expect(invoke(createEpisodesSource())).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await command;
  });
});
