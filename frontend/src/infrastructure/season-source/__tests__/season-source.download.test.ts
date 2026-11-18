import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The season source's two download commands, each called the way the Daily Board calls it. */
const DOWNLOAD_COMMANDS = [
  {
    binding: 'TriggerSeasonDownloads',
    run: (source: Awaited<ReturnType<typeof loadSource>>) => source.triggerSeasonDownloads(),
    args: [] as unknown[],
  },
  {
    binding: 'DownloadSeasonAnimes',
    run: (source: Awaited<ReturnType<typeof loadSource>>) => source.downloadSeasonAnimes(['anime-a', 'anime-b']),
    args: [['anime-a', 'anime-b']] as unknown[],
  },
] as const;

/**
 * Imports a fresh season source, so it reads the `window.go` the test set.
 * @returns The source.
 */
async function loadSource() {
  const { createSeasonSource } = await import('../season-source.helpers');
  return createSeasonSource();
}

describe('season source download commands', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it.each(DOWNLOAD_COMMANDS)('$binding resolves once the Go binding started the run', async ({ binding, run, args }) => {
    const call = vi.fn().mockResolvedValue(undefined);
    Reflect.set(window, 'go', { desktop: { App: { [binding]: call } } });

    await expect(run(await loadSource())).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledWith(...args);
  });

  it.each(DOWNLOAD_COMMANDS)('$binding rejects with the refusal the Go binding answered', async ({ binding, run }) => {
    const refusal = new Error('{"code":"internal","message":"a download run is already in progress"}');
    Reflect.set(window, 'go', { desktop: { App: { [binding]: vi.fn().mockRejectedValue(refusal) } } });

    await expect(run(await loadSource())).rejects.toMatchObject({ code: 'internal', message: 'a download run is already in progress' });
  });

  it.each(DOWNLOAD_COMMANDS)('$binding rejects as unavailable when the binding never appears', async ({ run }) => {
    vi.useFakeTimers();
    const answer = run(await loadSource());
    const assertion = expect(answer).rejects.toMatchObject({ code: 'unavailable' });
    await vi.runAllTimersAsync();

    await assertion;
  });
});
