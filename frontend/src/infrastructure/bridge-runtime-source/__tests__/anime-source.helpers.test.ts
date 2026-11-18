import { describe, expect, it, vi } from 'vitest';

import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One catalog row as `GetAnimes` answers it. */
const FRIEREN_ROW = { id: 'anime-1', name: 'Frieren' };

/** One watch-history page as both page bindings answer it. */
const PAGE = { items: [], nextCursor: '1700000000000:1', status: 'ok' };

/** The six anime read bindings, each answering `answer` or rejecting with `rejection`. */
function animeBindings(answer: (name: string) => unknown, rejection?: string) {
  const binding = (name: string) => (rejection === undefined ? vi.fn().mockResolvedValue(answer(name)) : vi.fn().mockRejectedValue(new Error(rejection)));
  return {
    GetAnimes: binding('GetAnimes'),
    GetAnimeDetail: binding('GetAnimeDetail'),
    GetWatchHistoryPage: binding('GetWatchHistoryPage'),
    GetAnimeWatchHistoryPage: binding('GetAnimeWatchHistoryPage'),
    GetAnimeCover: binding('GetAnimeCover'),
    PreviewAnimeCover: binding('PreviewAnimeCover'),
  };
}

/** Attaches the anime read bindings to a fake Wails `window.go`. */
function attachBindings(bindings: ReturnType<typeof animeBindings>) {
  window.go = { desktop: { App: bindings } } as never;
}

/** Calls every read of the source once. */
function callEveryRead(source: Awaited<ReturnType<typeof importSource>>) {
  return [
    source.getAnimes(),
    source.getAnimeDetail('anime-1'),
    source.getWatchHistoryPage({ search: '', animeIds: ['anime-1'], watchedFromMs: 0, watchedToMs: 0, order: 'newest', cursor: '', limit: 0 }),
    source.getAnimeWatchHistoryPage({ animeId: 'anime-1', cycle: 0, cursor: '', limit: 3 }),
    source.getAnimeCover('anime-1'),
    source.previewAnimeCover('C:/covers/frieren.jpg'),
  ];
}

/** Builds a fresh adapter from a fresh module graph. */
async function importSource() {
  const { createAnimeSource } = await import('../anime-source.helpers');
  return createAnimeSource();
}

describe('createAnimeSource', () => {
  useIsolatedWailsRuntime();

  it('answers what each binding answers, passing the arguments through', async () => {
    const answers: Record<string, unknown> = {
      GetAnimes: [FRIEREN_ROW],
      GetAnimeDetail: FRIEREN_ROW,
      GetWatchHistoryPage: PAGE,
      GetAnimeWatchHistoryPage: PAGE,
      GetAnimeCover: { source: 'cover', dataUrl: 'data:image/jpeg;base64,AA' },
      PreviewAnimeCover: { source: 'cover', dataUrl: 'data:image/jpeg;base64,BB' },
    };
    const bindings = animeBindings((name) => answers[name]);
    attachBindings(bindings);

    await expect(Promise.all(callEveryRead(await importSource()))).resolves.toEqual(Object.values(answers));
    expect(bindings.GetAnimeDetail).toHaveBeenCalledExactlyOnceWith('anime-1');
    expect(bindings.GetWatchHistoryPage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ animeIds: ['anime-1'], order: 'newest' }));
    expect(bindings.GetAnimeWatchHistoryPage).toHaveBeenCalledExactlyOnceWith({ animeId: 'anime-1', cycle: 0, cursor: '', limit: 3 });
    expect(bindings.GetAnimeCover).toHaveBeenCalledExactlyOnceWith('anime-1');
    expect(bindings.PreviewAnimeCover).toHaveBeenCalledExactlyOnceWith('C:/covers/frieren.jpg');
  });

  it('hands GetWatchHistoryPage a copy of the anime id list, never the caller array', async () => {
    const bindings = animeBindings(() => PAGE);
    attachBindings(bindings);
    const animeIds = ['anime-1', 'anime-2'];

    await (await importSource()).getWatchHistoryPage({ search: '', animeIds, watchedFromMs: 0, watchedToMs: 0, order: 'oldest', cursor: '', limit: 0 });

    expect(bindings.GetWatchHistoryPage.mock.calls[0]?.[0].animeIds).toEqual(animeIds);
    expect(bindings.GetWatchHistoryPage.mock.calls[0]?.[0].animeIds).not.toBe(animeIds);
  });

  it.each([
    ['the module is starting', '{"code":"unavailable","message":"anime is starting"}', { code: 'unavailable', message: 'anime is starting' }],
    ['the module failed', '{"code":"failed_precondition","message":"anime: db closed"}', { code: 'failed_precondition', message: 'anime: db closed' }],
    ['the anime is unknown', '{"code":"not_found","message":"anime anime-1 not found"}', { code: 'not_found', message: 'anime anime-1 not found' }],
    ['a plain rejection', 'boom', { code: 'internal', message: 'boom' }],
  ])('rejects every read with a BridgeError when %s, never with a fallback', async (_label, rejection, expected) => {
    attachBindings(animeBindings(() => undefined, rejection));

    for (const read of callEveryRead(await importSource())) {
      await expect(read).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    }
  });

  it('rejects every read as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const reads = callEveryRead(await importSource()).map((read) =>
      expect(read).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(reads);
  });
});
